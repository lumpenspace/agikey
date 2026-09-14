import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from './utils/logger.js';
import { saveDiscoveryCache, loadDiscoveryCache } from './cache.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Helper to find binary path
export async function findBinary(name) {
  try {
    const { stdout } = await execAsync(`which ${name}`, { env: process.env });
    const trimmed = stdout.trim();
    if (trimmed && fs.existsSync(trimmed)) return trimmed;
  } catch {}

  const home = os.homedir();
  const searchPaths = [
    path.join(home, '.local', 'bin', name),
    path.join(home, '.cargo', 'bin', name),
    '/opt/homebrew/bin/' + name,
    '/usr/local/bin/' + name,
    '/usr/bin/' + name,
  ];

  const nvmDir = path.join(home, '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmDir)) {
    try {
      const versions = fs.readdirSync(nvmDir);
      for (const v of versions) {
        searchPaths.push(path.join(nvmDir, v, 'bin', name));
      }
    } catch {}
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

export async function detectAgy(customPath = null) {
  const binaryPath = customPath || (await findBinary('agy'));
  if (!binaryPath) {
    return {
      id: 'agy',
      name: 'Antigravity CLI (agy)',
      installed: false,
      binaryPath: null,
      version: null,
      status: 'not_found',
      statusMessage: 'agy executable not found in PATH or ~/.local/bin',
      defaultModel: 'gemini-3.8-flash-high',
      models: [
        { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'agy' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', provider: 'agy' },
      ],
      capabilities: {
        streaming: true,
        jsonMode: true,
        reasoningEffort: true,
        systemPrompt: true,
      },
    };
  }

  let version = null;
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 3000 });
    version = stdout.trim().split('\n')[0];
  } catch {}

  const models = [];
  let status = 'ready';
  let statusMessage = 'Ready to serve';

  try {
    const { stdout } = await execFileAsync(binaryPath, ['models'], { timeout: 6000 });
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Fetching')) continue;
      const parts = trimmed.split(/\t+|\s{2,}/);
      if (parts.length >= 1 && parts[0]) {
        models.push({
          id: parts[0],
          name: parts[1] || parts[0],
          provider: 'agy',
        });
      }
    }
  } catch (err) {
    status = 'error';
    statusMessage = `Failed querying models: ${err.message}`;
  }

  if (models.length === 0) {
    models.push(
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'agy' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', provider: 'agy' },
    );
  }

  return {
    id: 'agy',
    name: 'Antigravity CLI (agy)',
    installed: true,
    binaryPath,
    version,
    status,
    statusMessage,
    defaultModel: models[0]?.id || 'gemini-3.8-flash-high',
    models,
    capabilities: {
      streaming: true,
      jsonMode: true,
      reasoningEffort: true,
      systemPrompt: true,
    },
  };
}

export async function detectClaude(customPath = null) {
  const binaryPath = customPath || (await findBinary('claude'));
  if (!binaryPath) {
    return {
      id: 'claude',
      name: 'Claude Code',
      installed: false,
      binaryPath: null,
      version: null,
      status: 'not_found',
      statusMessage: 'claude executable not found in PATH',
      defaultModel: 'claude-3-7-sonnet',
      models: [
        { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'claude' },
        { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'claude' },
      ],
      capabilities: {
        streaming: true,
        jsonMode: true,
        reasoningEffort: false,
        systemPrompt: true,
      },
    };
  }

  let version = null;
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 3000 });
    version = stdout.trim().split('\n')[0];
  } catch {}

  let status = 'ready';
  let statusMessage = 'Installed';
  let accountInfo = null;

  try {
    const { stdout } = await execFileAsync(binaryPath, ['auth', 'status'], { timeout: 4000 });
    const authData = JSON.parse(stdout.trim());
    accountInfo = authData;
    if (authData.email) {
      statusMessage = `Logged in as ${authData.email}`;
    }
  } catch {}

  const models = [
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'claude' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'claude' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', provider: 'claude' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'claude' },
  ];

  return {
    id: 'claude',
    name: 'Claude Code',
    installed: true,
    binaryPath,
    version,
    status,
    statusMessage,
    accountInfo,
    defaultModel: 'claude-3-7-sonnet',
    models,
    capabilities: {
      streaming: true,
      jsonMode: true,
      reasoningEffort: false,
      systemPrompt: true,
    },
  };
}

export async function detectGrok(customPath = null) {
  const binaryPath = customPath || (await findBinary('grok'));
  if (!binaryPath) {
    return {
      id: 'grok',
      name: 'Grok CLI',
      installed: false,
      binaryPath: null,
      version: null,
      status: 'not_found',
      statusMessage: 'grok executable not found in PATH',
      defaultModel: 'grok-4.6',
      models: [
        { id: 'grok-4.6', name: 'Grok 4.6', provider: 'grok' },
        { id: 'grok-4.5', name: 'Grok 4.5', provider: 'grok' },
      ],
      capabilities: {
        streaming: true,
        jsonMode: true,
        reasoningEffort: true,
        systemPrompt: true,
      },
    };
  }

  let version = null;
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 3000 });
    version = stdout.trim().split('\n')[0];
  } catch {}

  let status = 'ready';
  let statusMessage = 'Ready';
  const models = [];

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['models'], { timeout: 4000 });
    const combined = `${stdout}\n${stderr}`;
    if (combined.includes('Not signed in') || combined.includes('not authenticated')) {
      status = 'needs_auth';
      statusMessage = 'Needs authentication (`grok login` or XAI_API_KEY)';
    }
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
        const id = trimmed.replace(/^[\*\-]\s*/, '').split(' ')[0].trim();
        if (id) {
          models.push({ id, name: id, provider: 'grok' });
        }
      }
    }
  } catch (err) {
    status = 'needs_auth';
    statusMessage = 'Authentication needed (`grok login`)';
  }

  if (models.length === 0) {
    models.push(
      { id: 'grok-4.6', name: 'Grok 4.6', provider: 'grok' },
      { id: 'grok-4.5', name: 'Grok 4.5', provider: 'grok' },
    );
  }

  return {
    id: 'grok',
    name: 'Grok CLI',
    installed: true,
    binaryPath,
    version,
    status,
    statusMessage,
    defaultModel: 'grok-4.6',
    models,
    capabilities: {
      streaming: true,
      jsonMode: true,
      reasoningEffort: true,
      systemPrompt: true,
    },
  };
}

export async function detectCodex(customPath = null) {
  let binaryPath = customPath || (await findBinary('codex'));
  if (!binaryPath) {
    binaryPath = await findBinary('chatgpt');
  }

  if (!binaryPath) {
    return {
      id: 'codex',
      name: 'Codex / ChatGPT CLI',
      installed: false,
      binaryPath: null,
      version: null,
      status: 'not_found',
      statusMessage: 'codex or chatgpt executable not found in PATH',
      defaultModel: 'gpt-4o',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'codex' },
        { id: 'o3-mini', name: 'o3-mini', provider: 'codex' },
      ],
      capabilities: {
        streaming: true,
        jsonMode: true,
        reasoningEffort: true,
        systemPrompt: true,
      },
    };
  }

  let version = null;
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], { timeout: 3000 });
    version = stdout.trim().split('\n')[0];
  } catch {}

  let status = 'ready';
  let statusMessage = 'Configured with ChatGPT account';

  let configuredModel = 'gpt-4o';
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const match = content.match(/model\s*=\s*"([^"]+)"/);
      if (match) configuredModel = match[1];
    }
  } catch {}

  const models = [
    { id: configuredModel, name: `${configuredModel} (default)`, provider: 'codex' },
    { id: 'o3-mini', name: 'o3-mini', provider: 'codex' },
    { id: 'o3', name: 'o3', provider: 'codex' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'codex' },
  ];

  return {
    id: 'codex',
    name: 'Codex / ChatGPT CLI',
    installed: true,
    binaryPath,
    version,
    status,
    statusMessage,
    defaultModel: configuredModel,
    models,
    capabilities: {
      streaming: true,
      jsonMode: true,
      reasoningEffort: true,
      systemPrompt: true,
    },
  };
}

export class Detector {
  constructor() {
    this.providers = new Map();
    this.lastChecked = 0;
    this.fromCache = false;
  }

  async init({ useCache = true, forceRefresh = false } = {}) {
    if (useCache && !forceRefresh) {
      const cached = loadDiscoveryCache();
      if (cached && Array.isArray(cached.providers) && cached.providers.length > 0) {
        this.providers.clear();
        for (const p of cached.providers) {
          this.providers.set(p.id, p);
        }
        this.lastChecked = new Date(cached.savedAt).getTime();
        this.fromCache = true;
        return this.getAllProviders();
      }
    }

    return this.refresh({ saveCache: true });
  }

  async refresh({ saveCache = true } = {}) {
    logger.info('Scanning system for AI CLIs (agy, claude, grok, codex/chatgpt)...');
    const [agy, claude, grok, codex] = await Promise.all([
      detectAgy(),
      detectClaude(),
      detectGrok(),
      detectCodex(),
    ]);

    this.providers.set('agy', agy);
    this.providers.set('claude', claude);
    this.providers.set('grok', grok);
    this.providers.set('codex', codex);
    this.lastChecked = Date.now();
    this.fromCache = false;

    for (const [id, info] of this.providers.entries()) {
      if (info.installed) {
        logger.info(`✓ Found ${info.name} [${info.version || 'unknown'}] at ${info.binaryPath} (${info.status})`);
      } else {
        logger.info(`✗ ${info.name}: not installed`);
      }
    }

    if (saveCache) {
      this.saveCache();
    }

    return this.getAllProviders();
  }

  saveCache() {
    const providers = this.getAllProviders();
    const models = this.getAvailableModels();
    return saveDiscoveryCache({
      providers,
      totalModels: models.length,
      models,
    });
  }

  getProvider(id) {
    if (!id) return null;
    const lower = id.toLowerCase();
    if (lower === 'chatgpt') return this.providers.get('codex');
    if (lower === 'claude-code') return this.providers.get('claude');
    return this.providers.get(lower);
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }

  getInstalledProviders() {
    return this.getAllProviders().filter(p => p.installed);
  }

  getAvailableModels({ all = false } = {}) {
    const list = [];
    const providersToScan = Array.from(this.providers.values());
    const anyInstalled = providersToScan.some(p => p.installed);
    const filterInstalled = !all && anyInstalled;

    for (const provider of providersToScan) {
      if (filterInstalled && !provider.installed) continue;
      list.push({
        id: provider.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: provider.id,
        permission: [],
        root: provider.id,
        parent: null,
        description: `Default model for ${provider.name}`,
      });

      if (provider.id === 'codex') {
        list.push({
          id: 'chatgpt',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'codex',
          permission: [],
          root: 'codex',
          parent: null,
          description: 'Alias for Codex / ChatGPT',
        });
      }

      for (const m of provider.models) {
        const fullId = `${provider.id}/${m.id}`;
        list.push({
          id: fullId,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider.id,
          permission: [],
          root: m.id,
          parent: null,
          description: m.name,
        });
        list.push({
          id: m.id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider.id,
          permission: [],
          root: m.id,
          parent: null,
          description: m.name,
        });
      }
    }
    const seen = new Set();
    return list.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  resolveModelTarget(modelName) {
    if (!modelName || modelName === 'default' || modelName === 'auto') {
      const readyProvider = this.getAllProviders().find(p => p.installed && p.status === 'ready')
        || this.getAllProviders().find(p => p.installed);
      if (!readyProvider) throw new Error('No AI CLI providers installed or available.');
      return { provider: readyProvider, model: readyProvider.defaultModel };
    }

    const lower = modelName.toLowerCase();

    if (lower === 'chatgpt') return { provider: this.getProvider('codex'), model: this.getProvider('codex')?.defaultModel };
    if (this.providers.has(lower)) {
      const p = this.providers.get(lower);
      return { provider: p, model: p.defaultModel };
    }

    if (modelName.includes('/')) {
      const [providerId, ...rest] = modelName.split('/');
      const specificModel = rest.join('/');
      const provider = this.getProvider(providerId);
      if (provider) {
        return { provider, model: specificModel };
      }
    }

    for (const provider of this.providers.values()) {
      if (!provider.installed) continue;
      const found = provider.models.find(m => m.id.toLowerCase() === lower);
      if (found) {
        return { provider, model: found.id };
      }
    }

    if (lower.startsWith('claude')) return { provider: this.getProvider('claude'), model: modelName };
    if (lower.startsWith('gemini')) return { provider: this.getProvider('agy'), model: modelName };
    if (lower.startsWith('grok')) return { provider: this.getProvider('grok'), model: modelName };
    if (lower.startsWith('gpt') || lower.startsWith('o3')) return { provider: this.getProvider('codex'), model: modelName };

    const fallback = this.getAllProviders().find(p => p.installed);
    if (!fallback) throw new Error(`No AI CLI providers installed to handle model '${modelName}'`);
    return { provider: fallback, model: modelName };
  }
}

export const detector = new Detector();
