import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { detector } from '../src/detector.js';
import { AgiaryServer } from '../src/server.js';
import { parseMessages, extractContent } from '../src/utils/messages.js';
import { formatChatChunk, formatChatResponse, formatTextResponse } from '../src/utils/sse.js';
import { saveDiscoveryCache, loadDiscoveryCache, clearDiscoveryCache } from '../src/cache.js';
import {
  createConversation,
  getConversation,
  listConversations,
  addMessageToConversation,
  updateConversation,
  deleteConversation,
  createConversationId,
} from '../src/conversations.js';

describe('Agiary / Agikey Unit Tests', () => {
  it('should parse messages into conversation turns and system prompt', () => {
    const messages = [
      { role: 'system', content: 'You are an assistant.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ];

    const parsed = parseMessages(messages);
    assert.equal(parsed.systemPrompt, 'You are an assistant.');
    assert.ok(parsed.conversationPrompt.includes('Hello!'));
    assert.ok(parsed.conversationPrompt.includes('Hi there!'));
    assert.ok(parsed.conversationPrompt.includes('How are you?'));
    assert.equal(parsed.userPrompt, 'How are you?');
  });

  it('should handle single user message without system prompt cleanly', () => {
    const messages = [{ role: 'user', content: 'Just a single query' }];
    const parsed = parseMessages(messages);
    assert.equal(parsed.systemPrompt, '');
    assert.equal(parsed.conversationPrompt, 'Just a single query');
  });

  it('should format OpenAI chat completion response object correctly', () => {
    const response = formatChatResponse({
      id: 'chatcmpl-test123',
      model: 'agy',
      content: 'Test content',
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    });

    assert.equal(response.id, 'chatcmpl-test123');
    assert.equal(response.object, 'chat.completion');
    assert.equal(response.choices[0].message.role, 'assistant');
    assert.equal(response.choices[0].message.content, 'Test content');
    assert.equal(response.usage.total_tokens, 15);
  });

  it('should format OpenAI chat chunk correctly', () => {
    const chunk = formatChatChunk({
      id: 'chatcmpl-test123',
      model: 'agy',
      delta: { content: 'hello' },
    });

    assert.equal(chunk.object, 'chat.completion.chunk');
    assert.equal(chunk.choices[0].delta.content, 'hello');
  });

  it('should save and reload discovery cache', () => {
    const sample = {
      testKey: 'testVal',
      providers: [{ id: 'agy', name: 'Antigravity CLI' }],
    };
    saveDiscoveryCache(sample);
    const loaded = loadDiscoveryCache();
    assert.ok(loaded);
    assert.equal(loaded.testKey, 'testVal');
    assert.equal(loaded.providers[0].id, 'agy');
  });

  it('should create, update, append messages, and delete a conversation', () => {
    const conv = createConversation({
      title: 'Test Thread',
      model: 'agy',
      messages: [{ role: 'user', content: 'Initial question' }],
      metadata: { test: true },
    });

    assert.ok(conv.id.startsWith('conv-'));
    assert.equal(conv.title, 'Test Thread');
    assert.equal(conv.messages.length, 1);

    const fetched = getConversation(conv.id);
    assert.ok(fetched);
    assert.equal(fetched.id, conv.id);

    const appendRes = addMessageToConversation(conv.id, { role: 'assistant', content: 'Initial answer' });
    assert.equal(appendRes.conversation.messages.length, 2);

    const updated = updateConversation(conv.id, { title: 'Renamed Thread' });
    assert.equal(updated.title, 'Renamed Thread');

    const list = listConversations({ limit: 100 });
    assert.ok(list.data.some(c => c.id === conv.id));

    const deleted = deleteConversation(conv.id);
    assert.equal(deleted, true);
    assert.equal(getConversation(conv.id), null);
  });
});

describe('Detector & Provider Discovery', () => {
  it('should detect installed CLI agents', async () => {
    const providers = await detector.refresh({ saveCache: false });
    assert.ok(providers.length >= 4, 'Should detect 4 CLI providers');

    const agy = detector.getProvider('agy');
    assert.ok(agy, 'agy provider should exist');
    // agy can be installed or not depending on runner
    assert.ok(typeof agy.installed === 'boolean');

    const claude = detector.getProvider('claude');
    assert.ok(claude, 'claude provider should exist');
    assert.ok(typeof claude.installed === 'boolean');

    const grok = detector.getProvider('grok');
    assert.ok(grok, 'grok provider should exist');
    assert.ok(typeof grok.installed === 'boolean');

    const codex = detector.getProvider('codex');
    assert.ok(codex, 'codex provider should exist');
    assert.ok(typeof codex.installed === 'boolean');
  });

  it('should return OpenAI formatted models list', () => {
    const models = detector.getAvailableModels();
    assert.ok(models.length > 0);
    const model = models[0];
    assert.equal(model.object, 'model');
    assert.ok(model.id);
    assert.ok(model.owned_by);
  });

  it('should resolve model targets correctly', () => {
    const resAgy = detector.resolveModelTarget('agy');
    assert.equal(resAgy.provider.id, 'agy');

    const resGemini = detector.resolveModelTarget('gemini-3.8-flash-high');
    assert.equal(resGemini.provider.id, 'agy');
    assert.equal(resGemini.model, 'gemini-3.8-flash-high');

    const resClaude = detector.resolveModelTarget('claude');
    assert.equal(resClaude.provider.id, 'claude');

    const resGrok = detector.resolveModelTarget('grok');
    assert.equal(resGrok.provider.id, 'grok');

    const resCodex = detector.resolveModelTarget('codex');
    assert.equal(resCodex.provider.id, 'codex');

    const resChatgpt = detector.resolveModelTarget('chatgpt');
    assert.equal(resChatgpt.provider.id, 'codex');
  });
});

describe('HTTP API Server Integration Tests', () => {
  const TEST_PORT = 8992;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
  let serverInstance;

  before(async () => {
    serverInstance = new AgiaryServer({ port: TEST_PORT, host: '127.0.0.1' });
    await serverInstance.start();
  });

  after(async () => {
    await serverInstance.stop();
  });

  it('GET /health returns 200 and healthy status', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  it('GET /api/status returns all providers', async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.providers));
    assert.ok(data.providers.length >= 4);
  });

  it('GET /v1/models returns OpenAI model list', async () => {
    const res = await fetch(`${BASE_URL}/v1/models`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.object, 'list');
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.some(m => m.id === 'agy'));
  });

  it('GET /v1/models/:model returns single model info', async () => {
    const res = await fetch(`${BASE_URL}/v1/models/agy`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, 'agy');
    assert.equal(data.owned_by, 'agy');
  });

  it('GET / serves the Web UI dashboard HTML', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Agikey') || text.includes('Agiary'));
    assert.ok(text.includes('OpenAI-Compatible Local API Gateway'));
  });

  it('POST /v1/chat/completions non-streaming returns standard OpenAI completion', async (t) => {
    const readyProvider = detector.getAllProviders().find(p => p.installed && p.status === 'ready');
    if (!readyProvider) return t.skip('No ready CLI provider in environment');
    const payload = {
      model: 'agy',
      messages: [
        { role: 'user', content: 'Say the single word "VERIFIED" and nothing else.' }
      ],
      stream: false
    };

    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.object, 'chat.completion');
    assert.ok(data.id.startsWith('chatcmpl-'));
    assert.equal(data.choices[0].message.role, 'assistant');
    assert.ok(data.choices[0].message.content.length > 0);
    assert.ok(data.usage.total_tokens > 0);
  });

  it('POST /v1/chat/completions streaming returns SSE stream with [DONE]', async (t) => {
    const readyProvider = detector.getAllProviders().find(p => p.installed && p.status === 'ready');
    if (!readyProvider) return t.skip('No ready CLI provider in environment');
    const payload = {
      model: 'agy',
      messages: [
        { role: 'user', content: 'Say 1, 2, 3.' }
      ],
      stream: true
    };

    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/event-stream'));

    const text = await res.text();
    assert.ok(text.includes('data: {'));
    assert.ok(text.includes('chat.completion.chunk'));
    assert.ok(text.includes('data: [DONE]'));
  });

  it('POST /v1/completions returns legacy text completion', async (t) => {
    const readyProvider = detector.getAllProviders().find(p => p.installed && p.status === 'ready');
    if (!readyProvider) return t.skip('No ready CLI provider in environment');
    const payload = {
      model: 'agy',
      prompt: 'Complete this: 1 + 1 =',
      stream: false
    };

    const res = await fetch(`${BASE_URL}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.object, 'text_completion');
    assert.ok(data.choices[0].text.length > 0);
  });

  it('Returns proper 400 error when messages parameter is missing', async () => {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agy' })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
    assert.equal(data.error.type, 'invalid_request_error');
  });

  it('Returns proper CORS headers on OPTIONS preflight', async () => {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'OPTIONS'
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  describe('Conversations HTTP Endpoints', () => {
    let testConvId;

    it('POST /v1/conversations creates a new thread', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HTTP Test Thread',
          model: 'agy',
          messages: [{ role: 'user', content: 'What is 2+2?' }],
          metadata: { client: 'integration-test' }
        })
      });

      assert.equal(res.status, 201);
      const conv = await res.json();
      assert.ok(conv.id);
      assert.equal(conv.object, 'conversation');
      assert.equal(conv.title, 'HTTP Test Thread');
      assert.equal(conv.messages.length, 1);
      testConvId = conv.id;
    });

    it('GET /v1/conversations lists conversations including created thread', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.object, 'list');
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.some(c => c.id === testConvId));
    });

    it('GET /api/v1/conversations works identically for dual compatibility', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/conversations`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.object, 'list');
      assert.ok(Array.isArray(data.data));
    });

    it('GET /v1/conversations/:id returns thread details', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations/${testConvId}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.id, testConvId);
      assert.equal(data.title, 'HTTP Test Thread');
    });

    it('GET /v1/conversations/:id/messages returns messages in thread', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations/${testConvId}/messages`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.object, 'list');
      assert.equal(data.conversation_id, testConvId);
      assert.equal(data.data.length, 1);
      assert.equal(data.data[0].content, 'What is 2+2?');
    });

    it('PATCH /v1/conversations/:id updates title and metadata', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations/${testConvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Thread Title',
          metadata: { client: 'integration-test', updated: true }
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.title, 'Updated Thread Title');
      assert.equal(data.metadata.updated, true);
    });

    it('POST /v1/chat/completions with conversation_id attaches to conversation history', async (t) => {
      const readyProvider = detector.getAllProviders().find(p => p.installed && p.status === 'ready');
      if (!readyProvider) return t.skip('No ready CLI provider in environment');

      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'agy',
          conversation_id: testConvId,
          messages: [{ role: 'user', content: 'Say "HELLO_CONV"' }],
          stream: false
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.conversation_id, testConvId);

      // Verify thread now has user + assistant messages appended
      const convRes = await fetch(`${BASE_URL}/v1/conversations/${testConvId}`);
      const updatedConv = await convRes.json();
      assert.ok(updatedConv.messages.length >= 3);
      assert.ok(updatedConv.messages.some(m => m.role === 'assistant'));
    });

    it('DELETE /v1/conversations/:id deletes thread', async () => {
      const res = await fetch(`${BASE_URL}/v1/conversations/${testConvId}`, {
        method: 'DELETE'
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.deleted, true);

      const checkRes = await fetch(`${BASE_URL}/v1/conversations/${testConvId}`);
      assert.equal(checkRes.status, 404);
    });
  });
});
