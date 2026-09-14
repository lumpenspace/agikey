import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { BaseAdapter } from './base.js';
import { parseMessages } from '../utils/messages.js';
import { logger } from '../utils/logger.js';

export class AgyAdapter extends BaseAdapter {
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

    const args = ['--output-format', 'stream-json', '-p', finalPrompt];

    // Model selection
    if (model && model !== 'agy' && model !== 'default') {
      const cleanModel = model.replace(/^agy\//, '');
      args.unshift('--model', cleanModel);

      // Add reasoning effort only if model doesn't already contain effort suffix
      if (reasoningEffort && !cleanModel.match(/-(low|medium|high)$/i)) {
        args.unshift('--effort', reasoningEffort.toLowerCase());
      }
    } else if (reasoningEffort) {
      args.unshift('--effort', reasoningEffort.toLowerCase());
    }

    // Structured output / JSON mode
    if (responseFormat) {
      if (responseFormat.type === 'json_object' || responseFormat.type === 'json_schema') {
        const schema = responseFormat.json_schema?.schema || {
          type: 'object',
          additionalProperties: true,
        };
        args.unshift('--json-schema', JSON.stringify(schema));
      }
    }

    logger.debug(`Spawning agy: ${this.binaryPath} ${args.filter((_, i) => i < 6).join(' ')}...`);

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

          if (event.event === 'step_update' && event.step_update) {
            const delta = event.step_update.text_delta;
            if (delta) {
              accumulatedText += delta;
              if (onDelta) {
                onDelta(delta);
              }
            }
            if (event.step_update.usage) {
              const u = event.step_update.usage;
              usageInfo = {
                prompt_tokens: u.input_tokens || 0,
                completion_tokens: u.output_tokens || 0,
                total_tokens: u.total_tokens || 0,
              };
            }
          } else if (event.event === 'result' && event.result) {
            if (event.result.status === 'ERROR') {
              reject(new Error(event.result.error || 'agy returned an error'));
              return;
            }
            if (event.result.response && !accumulatedText) {
              accumulatedText = event.result.response;
              if (onDelta) onDelta(accumulatedText);
            }
            if (event.result.usage) {
              const u = event.result.usage;
              usageInfo = {
                prompt_tokens: u.input_tokens || 0,
                completion_tokens: u.output_tokens || 0,
                total_tokens: u.total_tokens || 0,
              };
            }
          }
        } catch {
          // Non-JSON line fallback
          if (!trimmed.startsWith('{')) {
            accumulatedText += trimmed + '\n';
            if (onDelta) onDelta(trimmed + '\n');
          }
        }
      });

      child.on('error', err => {
        reject(new Error(`Failed to spawn agy process: ${err.message}`));
      });

      child.on('close', code => {
        if (code !== 0 && !accumulatedText) {
          const msg = stderrText.trim() || `agy exited with code ${code}`;
          reject(new Error(msg));
          return;
        }

        // Estimate tokens if usage is 0
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
