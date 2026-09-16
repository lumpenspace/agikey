import { runProcess } from './process.js';
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

    logger.debug('Spawning agy provider');

    return runProcess(this.binaryPath, args, {
      signal, onDelta, prompt: finalPrompt, cwd: this.providerInfo.cwd,
      parseEvent(event, content) {
        if (event.event === 'result') {
          if (event.result?.status === 'ERROR') return { error: event.result.error || 'agy returned an error' };
          return { text: content ? '' : event.result?.response, usage: event.result?.usage };
        }
        if (event.event === 'step_update') return { text: event.step_update?.text_delta, usage: event.step_update?.usage };
      },
    });
  }
}
