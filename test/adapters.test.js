import { it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createAdapter } from '../src/adapters/index.js';
import { runProcess } from '../src/adapters/process.js';
const binaryPath = fileURLToPath(new URL('./fixtures/provider.mjs', import.meta.url));
for (const id of ['agy', 'claude', 'grok', 'codex']) {
  const adapter = createAdapter({ id, name: id, binaryPath });
  it(`${id}: parses native events without duplicate text or object coercion`, async () => {
    const chunks = [];
    const result = await adapter.execute({ prompt: 'Hello', onDelta: text => chunks.push(text) });
    assert.equal(result.content, 'Hello fixture');
    assert.equal(chunks.join(''), 'Hello fixture');
    assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
  });
  it(`${id}: rejects nonzero exits even after partial output`, async () => {
    await assert.rejects(adapter.execute({ prompt: 'FIXTURE_EXIT' }), /exited/);
  });
  it(`${id}: handles cancellation before spawning`, async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(adapter.execute({ prompt: 'Hello', signal: controller.signal }), /aborted/);
  });
  if (id !== 'grok') it(`${id}: rejects structured provider failure after partial output`, async () => {
    await assert.rejects(adapter.execute({ prompt: 'FIXTURE_ERROR' }), /fixture failure/);
  });
}
it('terminates a hanging provider on timeout', async () => {
  await assert.rejects(runProcess(binaryPath, ['FIXTURE_HANG'], { prompt: '', parseEvent: () => ({}), timeoutMs: 50 }), /timed out/);
});
it('terminates a running provider on client cancellation', async () => {
  const controller = new AbortController();
  const result = runProcess(binaryPath, ['FIXTURE_HANG'], { prompt: '', parseEvent: () => ({}), signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(result, /aborted/);
});
