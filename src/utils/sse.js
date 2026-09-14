import crypto from 'node:crypto';

export function createCompletionId(prefix = 'chatcmpl') {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function writeSSEChunk(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function writeSSEDone(res) {
  res.write('data: [DONE]\n\n');
}

export function formatChatChunk({ id, model, delta = {}, finishReason = null, usage = null }) {
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
  if (usage) {
    chunk.usage = usage;
  }
  return chunk;
}

export function formatTextChunk({ id, model, text = '', finishReason = null, usage = null }) {
  const chunk = {
    id,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        text,
        index: 0,
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
  };
  if (usage) {
    chunk.usage = usage;
  }
  return chunk;
}

export function formatChatResponse({ id, model, content, finishReason = 'stop', usage = null }) {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: finishReason,
      },
    ],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function formatTextResponse({ id, model, text, finishReason = 'stop', usage = null }) {
  return {
    id,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        text,
        index: 0,
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
