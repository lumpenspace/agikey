import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { BaseAdapter } from './base.js';
import { parseMessages } from '../utils/messages.js';
import { logger } from '../utils/logger.js';

export class ClaudeAdapter extends BaseAdapter {
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
    let systemPrompt = '';

    if (messages && messages.length > 0) {
      const parsed = parseMessages(messages);
      finalPrompt = parsed.conversationPrompt;
      systemPrompt = parsed.systemPrompt;
    } else if (prompt) {
      finalPrompt = typeof prompt === 'string' ? prompt : prompt.join('\n');
    }

    if (!finalPrompt) {
      throw new Error('Prompt or messages are required.');
    }

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--tools', '',
      '--no-session-persistence',
    ];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (model && model !== 'claude' && model !== 'claude-code' && model !== 'default') {
      const cleanModel = model.replace(/^claude\//, '');
      args.push('--model', cleanModel);
    }

    if (responseFormat) {
      if (responseFormat.type === 'json_object' || responseFormat.type === 'json_schema') {
        const schema = responseFormat.json_schema?.schema || {
          type: 'object',
          additionalProperties: true,
        };
        args.push('--json-schema', JSON.stringify(schema));
      }
    }

    args.push(finalPrompt);

    logger.debug(`Spawning claude: ${this.binaryPath} ${args.filter((_, i) => i < 6).join(' ')}...`);

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
          // Stream event formats from claude
          if (event.type === 'text_delta' || event.type === 'content_block_delta') {
            const text = event.text || event.delta?.text || '';
            if (text) {
              accumulatedText += text;
              if (onDelta) onDelta(text);
            }
          } else if (event.type === 'message_delta' && event.usage) {
            usageInfo.completion_tokens = event.usage.output_tokens || 0;
            usageInfo.total_tokens = usageInfo.prompt_tokens + usageInfo.completion_tokens;
          } else if (event.type === 'message_start' && event.message?.usage) {
            usageInfo.prompt_tokens = event.message.usage.input_tokens || 0;
          } else if (event.result) {
            if (typeof event.result === 'string' && !accumulatedText) {
              accumulatedText = event.result;
              if (onDelta) onDelta(accumulatedText);
            }
          }
        } catch {
          // If plain text line
          accumulatedText += trimmed + '\n';
          if (onDelta) onDelta(trimmed + '\n');
        }
      });

      child.on('error', err => {
        reject(new Error(`Failed to spawn claude process: ${err.message}`));
      });

      child.on('close', code => {
        if (code !== 0 && !accumulatedText) {
          const errMessage = stderrText.trim();
          if (errMessage.includes('Credit balance is too low')) {
            const err = new Error(
              'Claude credit balance is too low. Link a subscription via `claude setup-token` or top up API credits.'
            );
            err.statusCode = 402;
            err.code = 'insufficient_quota';
            reject(err);
            return;
          }
          if (errMessage.includes('Not logged in') || errMessage.includes('Unauthorized')) {
            const err = new Error('Claude is not logged in. Run `claude auth login`.');
            err.statusCode = 401;
            err.code = 'unauthorized';
            reject(err);
            return;
          }
          reject(new Error(errMessage || `Claude exited with code ${code}`));
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
