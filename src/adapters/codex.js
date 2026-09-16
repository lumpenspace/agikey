import { runProcess } from './process.js';
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
      '--json', '--sandbox', 'read-only',
    ];

    if (model && model !== 'codex' && model !== 'chatgpt' && model !== 'default') {
      const cleanModel = model.replace(/^(codex|chatgpt)\//, '');
      args.push('-m', cleanModel);
    }

    if (reasoningEffort) args.push('-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    if (responseFormat) throw Object.assign(new Error('response_format is not supported by the Codex adapter'), { statusCode: 400 });
    args.push('--', finalPrompt);

    logger.debug('Spawning codex provider');

    return runProcess(this.binaryPath, args, {
      signal, onDelta, prompt: finalPrompt, cwd: this.providerInfo.cwd,
      parseEvent(event, content) {
        if (event.type === 'error' || event.type === 'turn.failed') return { error: event.message || event.error?.message || 'Codex turn failed' };
        if (event.type === 'item.completed' && ['agent_message', 'message', 'assistant'].includes(event.item?.type)) return { text: event.item.text || event.item.content };
        if (event.type === 'turn.delta') return { text: event.delta?.text || event.delta?.content };
        return { usage: event.usage };
      },
    });
  }
}
