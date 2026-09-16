import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detector } from '../src/detector.js';
import { AgiaryServer } from '../src/server.js';
import { setLogLevel } from '../src/utils/logger.js';
setLogLevel('ERROR');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agikey-live-'));
process.env.AGIKEY_HOME = home;
const results = [];
let server;
try {
  await detector.refresh({ saveCache: false });
  const liveDetector = Object.create(detector);
  liveDetector.init = async () => detector.getAllProviders();
  server = new AgiaryServer({ port: 0, detector: liveDetector });
  await server.start();
  const base = `http://127.0.0.1:${server.port}`;
  const selected = process.argv.slice(2);
  for (const provider of detector.getAllProviders()) {
    if (selected.length && !selected.includes(provider.id)) continue;
    if (!provider.installed || provider.status === 'needs_auth') {
      results.push({ provider: provider.id, status: 'skipped', reason: provider.status }); continue;
    }
    for (const stream of [false, true]) {
      const start = Date.now();
      try {
        const res = await fetch(base + '/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: provider.id, messages: [{ role: 'user', content: 'Do not use tools, access files, or take actions. Reply with exactly AGIKEY_OK and nothing else.' }], stream }),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) throw new Error((await res.json()).error?.message || `HTTP ${res.status}`);
        let content;
        if (stream) {
          const raw = await res.text();
          const events = raw.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
          const error = events.find(event => event.error);
          if (error) throw new Error(error.error.message);
          if (!raw.includes('data: [DONE]')) throw new Error('Missing SSE terminator');
          content = events.map(event => event.choices?.[0]?.delta?.content || '').join('');
        } else content = (await res.json()).choices[0].message.content;
        if (content.trim() !== 'AGIKEY_OK') throw new Error(`Unexpected response: ${content.slice(0, 160)}`);
        results.push({ provider: provider.id, version: provider.version, stream, status: 'passed', durationMs: Date.now() - start });
      } catch (error) {
        results.push({ provider: provider.id, version: provider.version, stream, status: 'failed', reason: error.message.slice(0, 500) });
      }
    }
  }
} finally {
  await server?.stop();
  fs.rmSync(home, { recursive: true, force: true });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
