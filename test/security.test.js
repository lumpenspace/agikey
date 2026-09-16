import http from 'node:http';
import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgiaryServer } from '../src/server.js';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agikey-security-'));
process.env.AGIKEY_HOME = home;
const detector = { init: async () => [], refresh: async () => [], getAllProviders: () => [], getAvailableModels: () => [] };
let server, base;
before(async () => { server = new AgiaryServer({ port: 0, apiKey: 'test-key', detector }); await server.start(); base = `http://127.0.0.1:${server.port}`; });
after(async () => { await server.stop(); fs.rmSync(home, { recursive: true, force: true }); });
const send = (url, body, method = 'POST') => fetch(base + url, { method, headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
for (const route of ['/api/status', '/v1/status', '/api/logs', '/api/check', '/v1/models', '/v1/conversations', '/api/v1/conversations']) {
  it(`requires authentication on ${route}`, async () => {
    assert.equal((await fetch(base + route, { method: route === '/api/check' ? 'POST' : 'GET' })).status, 401);
  });
}
it('permits public health and dashboard and authenticated management', async () => {
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/api/status', { headers: { Authorization: 'Bearer test-key' } })).status, 200);
});
it('rejects requests from unrelated browser origins', async () => {
  const res = await fetch(base + '/api/check', { method: 'POST', headers: { Origin: 'https://example.com', Authorization: 'Bearer test-key' } });
  assert.equal(res.status, 403);
});
for (const body of ['null', '[]', '{broken', { messages: [null] }, { messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }, { stream: 'false' }, { model: 12 }, { temperature: 0.5 }, { prompt: ['one', 'two'] }, { conversation_id: '../escape' }]) {
  it(`rejects invalid input ${JSON.stringify(body)}`, async () => {
    const res = await send('/v1/chat/completions', body);
    assert.equal(res.status, 400); assert.ok((await res.json()).error);
  });
}
it('rejects malformed conversation requests instead of creating empty records', async () => {
  assert.equal((await send('/v1/conversations', '{bad')).status, 400);
  const res = await fetch(base + '/v1/conversations', { headers: { Authorization: 'Bearer test-key' } });
  assert.equal((await res.json()).total, 0);
});
it('rejects oversized requests', async () => {
  assert.equal((await send('/v1/chat/completions', JSON.stringify({ padding: 'a'.repeat(1024 * 1024) }))).status, 413);
});
it('does not overwrite an existing conversation on duplicate creation', async () => {
  assert.equal((await send('/v1/conversations', { id: 'unique', title: 'Original' })).status, 201);
  assert.equal((await send('/v1/conversations', { id: 'unique', title: 'Overwrite' })).status, 409);
  const res = await fetch(base + '/v1/conversations/unique', { headers: { Authorization: 'Bearer test-key' } });
  assert.equal((await res.json()).title, 'Original');
});
it('requires a key when listening beyond loopback', async () => {
  await assert.rejects(new AgiaryServer({ host: '0.0.0.0', apiKey: '', detector }).start(), /requires/);
});

it('rejects a hostile Host header on loopback', async () => {
  const status = await new Promise((resolve, reject) => {
    http.get(base + '/api/status', { headers: { Host: 'attacker.example', Authorization: 'Bearer test-key' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});
