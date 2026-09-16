import { runProcess } from './process.js';
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
      finalPrompt = parseMessages(messages.filter(m => !['system', 'developer'].includes(m.role))).conversationPrompt;
      systemPrompt = parsed.systemPrompt;
    } else if (prompt) {
      finalPrompt = typeof prompt === 'string' ? prompt : prompt.join('\n');
    }

    if (!finalPrompt) {
      throw new Error('Prompt or messages are required.');
    }

    const args = [
      '--output-format', 'streaming-messages-json',
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

    logger.debug('Spawning grok provider');

    return runProcess(this.binaryPath, args, {
      signal, onDelta, prompt: finalPrompt, cwd: this.providerInfo.cwd,
      parseEvent(event, content) {
        if (event.is_error || event.type === 'error') return { error: event.error?.message || event.result || event.message || 'Grok turn failed' };
        const update = event.type === 'stream_event' ? event.event : event;
        if (update?.type === 'content_block_delta') return { text: update.delta?.text };
        if (typeof event.delta === 'string') return { text: event.delta };
        if (typeof event.text_delta === 'string') return { text: event.text_delta };
        const message = event.message?.content;
        if (!content && message) return { text: typeof message === 'string' ? message : message.filter(p => p.type === 'text').map(p => p.text).join(''), usage: event.usage };
        return { text: content ? '' : (event.structured_output ? JSON.stringify(event.structured_output) : event.result), usage: event.usage };
      },
    });
  }
}
