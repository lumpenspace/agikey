import { runProcess } from './process.js';
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
      finalPrompt = parseMessages(messages.filter(m => !['system', 'developer'].includes(m.role))).conversationPrompt;
      systemPrompt = parsed.systemPrompt;
    } else if (prompt) {
      finalPrompt = typeof prompt === 'string' ? prompt : prompt.join('\n');
    }

    if (!finalPrompt) {
      throw new Error('Prompt or messages are required.');
    }

    const args = [
      '--print', '--verbose', '--include-partial-messages',
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

    if (reasoningEffort) args.push('--effort', reasoningEffort);
    args.push('--', finalPrompt);

    logger.debug('Spawning claude provider');

    return runProcess(this.binaryPath, args, {
      signal, onDelta, prompt: finalPrompt, cwd: this.providerInfo.cwd,
      parseEvent(event, content) {
        if (event.type === 'result') {
          if (event.is_error) return { error: event.result || event.errors?.join('; ') || 'Claude turn failed' };
          return { text: content ? '' : (event.structured_output ? JSON.stringify(event.structured_output) : event.result), usage: event.usage };
        }
        const update = event.type === 'stream_event' ? event.event : event;
        if (update?.type === 'content_block_delta') return { text: update.delta?.text };
        if (update?.type === 'text_delta') return { text: update.text };
        if (event.type === 'assistant' && !content) return { text: event.message?.content?.filter(p => p.type === 'text').map(p => p.text).join('') };
      },
    });
  }
}
