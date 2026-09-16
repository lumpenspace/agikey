import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agikey-package-'));
try {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { encoding: 'utf8' }));
  assert.equal(pack.name, 'agikey');
  for (const file of pack.files) {
    assert.match(file.path, /^(bin\/|src\/|public\/|docs\/|package\.json$|README\.md$|LICENSE$|SECURITY\.md$|CONTRIBUTING\.md$|CHANGELOG\.md$)/, `Unexpected package entry: ${file.path}`);
    assert.doesNotMatch(file.path, /(^|\/)(\.env|\.git|\.vercel|node_modules|discovery\.json|conversations\/)/);
  }
  const prefix = path.join(temporary, 'install');
  execFileSync('npm', ['install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, path.join(temporary, pack.filename)], { stdio: 'pipe' });
  for (const command of ['agikey', 'agiary']) {
    const help = execFileSync(path.join(prefix, 'bin', command), ['--help'], { encoding: 'utf8', env: { ...process.env, AGIKEY_HOME: path.join(temporary, 'data') } });
    assert.match(help, /USAGE/);
    assert.match(help, /discover/);
  }
  const conversations = JSON.parse(execFileSync(path.join(prefix, 'bin/agikey'), ['conversations', '--json'], { encoding: 'utf8', env: { ...process.env, AGIKEY_HOME: path.join(temporary, 'data') } }));
  assert.equal(conversations.total, 0);
  console.log(`Package verified: ${pack.filename}; ${pack.files.length} files; ${pack.size} bytes; both executable aliases work.`);
  console.log(`Integrity: ${pack.integrity}`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
