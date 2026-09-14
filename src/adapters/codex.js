import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { BaseAdapter } from './base.js';
import { parseMessages } from '../utils/messages.js';
import { logger } from '../utils/logger.js';

export class CodexAdapter extends BaseAdapter {
  async execute({
    messages,
    prompt,
    stream = false,
    model = null,
    temperature = null,
    maxTokens = null,
    reasoningEffort = null,
    responseFormat = null,
    signal = null,
    onDelta = null,
  }) {
    let finalPrompt = '';

    if (messages && messages.length > 0) {
      const parsed = parseMessages(messages);
      finalPrompt = parsed.conversationPrompt;
    } else if (prompt) {
      finalPrompt = typeof prompt === 'string' ? prompt : prompt.join('\n');
    }

    if (!finalPrompt) {
      throw new Error('Prompt or messages are required.');
    }

    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--json',
    ];

    if (model && model !== 'codex' && model !== 'chatgpt' && model !== 'default') {
      const cleanModel = model.replace(/^(codex|chatgpt)\//, '');
      args.push('-m', cleanModel);
    }

    args.push(finalPrompt);

    logger.debug(`Spawning codex: ${this.binaryPath} ${args.filter((_, i) => i < 6).join(' ')}...`);

    return new Promise((resolve, reject) => {
      let accumulatedText = '';
      let stderrText = '';
      let usageInfo = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      const child = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          try {
            child.kill('SIGTERM');
          } catch {}
          reject(new Error('Request aborted by client'));
        });
      }

      child.stderr.on('data', chunk => {
        stderrText += chunk.toString();
      });

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const event = JSON.parse(trimmed);

          if (event.type === 'item.completed' && event.item) {
            if (event.item.type === 'message' || event.item.role === 'assistant') {
              const text = event.item.text || event.item.content || '';
              if (text) {
                accumulatedText += text;
                if (onDelta) onDelta(text);
              }
            } else if (event.item.type === 'agent_message' || event.item.type === 'assistant') {
              const text = event.item.text || '';
              if (text) {
                accumulatedText += text;
                if (onDelta) onDelta(text);
              }
            }
          } else if (event.type === 'turn.delta' && event.delta) {
            const text = event.delta.text || event.delta.content || '';
            if (text) {
              accumulatedText += text;
              if (onDelta) onDelta(text);
            }
          } else if (event.type === 'error' || event.type === 'turn.failed') {
            const errMsg = event.message || event.error?.message || '';
            if (errMsg.includes('requires a newer version') || errMsg.includes('not supported')) {
              try {
                const parsedErr = JSON.parse(errMsg);
                if (parsedErr.error?.message) {
                  reject(new Error(parsedErr.error.message));
                  return;
                }
              } catch {}
            }
          }
          if (event.usage) {
            usageInfo = {
              prompt_tokens: event.usage.input_tokens || event.usage.prompt_tokens || 0,
              completion_tokens: event.usage.output_tokens || event.usage.completion_tokens || 0,
              total_tokens: event.usage.total_tokens || 0,
            };
          }
        } catch {
          if (!trimmed.startsWith('{') && !trimmed.startsWith('Reading')) {
            accumulatedText += trimmed + '\n';
            if (onDelta) onDelta(trimmed + '\n');
          }
        }
      });

      child.on('error', err => {
        reject(new Error(`Failed to spawn codex process: ${err.message}`));
      });

      child.on('close', code => {
        if (code !== 0 && !accumulatedText) {
          const combined = `${stderrText}\n${accumulatedText}`.trim();
          reject(new Error(combined || `Codex exited with code ${code}`));
          return;
        }

        if (usageInfo.total_tokens === 0) {
          const compTokens = Math.ceil(accumulatedText.length / 4);
          const promptTokens = Math.ceil(finalPrompt.length / 4);
          usageInfo = {
            prompt_tokens: promptTokens,
            completion_tokens: compTokens,
            total_tokens: promptTokens + compTokens,
          };
        }

        resolve({
          content: accumulatedText.trim(),
          usage: usageInfo,
        });
      });
    });
  }
}
