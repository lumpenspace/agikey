import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { BaseAdapter } from './base.js';
import { parseMessages } from '../utils/messages.js';
import { logger } from '../utils/logger.js';

export class GrokAdapter extends BaseAdapter {
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
      '--output-format', 'streaming-json',
      '--include-partial-messages',
      '--tools', '',
    ];

    if (systemPrompt) {
      args.push('--system-prompt-override', systemPrompt);
    }

    if (model && model !== 'grok' && model !== 'default') {
      const cleanModel = model.replace(/^grok\//, '');
      args.push('-m', cleanModel);
    }

    if (reasoningEffort) {
      args.push('--reasoning-effort', reasoningEffort.toLowerCase());
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

    args.push('-p', finalPrompt);

    logger.debug(`Spawning grok: ${this.binaryPath} ${args.filter((_, i) => i < 6).join(' ')}...`);

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
          // Grok streaming events
          if (event.delta || event.text_delta) {
            const text = event.delta || event.text_delta;
            accumulatedText += text;
            if (onDelta) onDelta(text);
          } else if (event.type === 'content_block_delta' && event.delta?.text) {
            const text = event.delta.text;
            accumulatedText += text;
            if (onDelta) onDelta(text);
          } else if (event.message?.content) {
            const text = typeof event.message.content === 'string'
              ? event.message.content
              : (event.message.content[0]?.text || '');
            if (text && !accumulatedText) {
              accumulatedText = text;
              if (onDelta) onDelta(text);
            }
          }
          if (event.usage) {
            usageInfo = {
              prompt_tokens: event.usage.input_tokens || 0,
              completion_tokens: event.usage.output_tokens || 0,
              total_tokens: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
            };
          }
        } catch {
          accumulatedText += trimmed + '\n';
          if (onDelta) onDelta(trimmed + '\n');
        }
      });

      child.on('error', err => {
        reject(new Error(`Failed to spawn grok process: ${err.message}`));
      });

      child.on('close', code => {
        if (code !== 0 && !accumulatedText) {
          const combinedErr = `${stderrText}\n${accumulatedText}`.trim();
          if (combinedErr.includes('Not signed in') || combinedErr.includes('grok login')) {
            const err = new Error('Grok is not authenticated. Run `grok login` or set XAI_API_KEY.');
            err.statusCode = 401;
            err.code = 'unauthorized';
            reject(err);
            return;
          }
          reject(new Error(combinedErr || `Grok exited with code ${code}`));
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
