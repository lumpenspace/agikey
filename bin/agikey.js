#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detector } from '../src/detector.js';
import { AgiaryServer } from '../src/server.js';
import { logger, setLogLevel, LogLevel } from '../src/utils/logger.js';
import { loadDiscoveryCache, getCacheFilePath, clearDiscoveryCache } from '../src/cache.js';

function printHelp() {
  console.log(`
\x1b[1m\x1b[38;5;214m⚿ Agikey\x1b[0m - OpenAI-compatible local API gateway for Claude Code, agy, Grok, and Codex/ChatGPT

\x1b[1mUSAGE\x1b[0m
  agikey [command] [options]

\x1b[1mCOMMANDS\x1b[0m
  \x1b[32mdiscover\x1b[0m, \x1b[32mscan\x1b[0m, \x1b[32mdetect\x1b[0m    Deep discovery of installed AI CLIs, capabilities & models (caches results)
  \x1b[32mserve\x1b[0m, \x1b[32mstart\x1b[0m                Start the OpenAI-compatible HTTP API server & web dashboard (default)
  \x1b[32mcheck\x1b[0m, \x1b[32mstatus\x1b[0m               Quick CLI agent status check
  \x1b[32mmodels\x1b[0m                      List all available models across all installed agents
  \x1b[32mconversations\x1b[0m, \x1b[32mconvs\x1b[0m        List persistent multi-turn conversation sessions
  \x1b[32mchat\x1b[0m [prompt]               Send a test prompt directly through the CLI
  \x1b[32mclear-cache\x1b[0m                 Remove the local discovery cache
  \x1b[32mhelp\x1b[0m, \x1b[32m--help\x1b[0m, \x1b[32m-h\x1b[0m             Show this help message

\x1b[1mOPTIONS\x1b[0m
  \x1b[33m-p, --port <number>\x1b[0m         Port to listen on (default: 8000, env: PORT)
  \x1b[33m--host <ip>\x1b[0m             Host to bind to (default: 127.0.0.1, env: HOST)
  \x1b[33m-k, --key <string>\x1b[0m          Require Bearer API key (optional, env: AGIKEY_API_KEY)
  \x1b[33m-m, --model <name>\x1b[0m          Model to target for chat command (default: auto)
  \x1b[33m-c, --conversation <id>\x1b[0m     Continue a persistent conversation by ID
  \x1b[33m--refresh\x1b[0m                   Bypass cache and force fresh scan of system
  \x1b[33m--json\x1b[0m                      Output results as JSON
  \x1b[33m--debug\x1b[0m                     Enable verbose debug logging

\x1b[1mEXAMPLES\x1b[0m
  $ agikey discover
  $ agikey serve --port 8000
  $ agikey conversations
  $ agikey chat -m agy "Explain quicksort in 2 sentences"
  $ agikey chat -c conv-1234 "Now in Python"
`);
}

function pathBasename(p) {
  if (!p) return '';
  return p.split('/').pop();
}

async function runCheck(asJson = false, forceRefresh = false) {
  const providers = await detector.init({ useCache: !forceRefresh, forceRefresh });

  if (asJson) {
    console.log(JSON.stringify(providers, null, 2));
    return;
  }

  console.log('\n\x1b[1m\x1b[36mAI Coding CLIs Status:\x1b[0m\n');
  console.log('\x1b[1m┌──────────────────────────┬───────────┬──────────────────────────────────────────┬────────────────────────────┐\x1b[0m');
  console.log('\x1b[1m│ Agent / CLI              │ Installed │ Version / Binary                         │ Status                     │\x1b[0m');
  console.log('\x1b[1m├──────────────────────────┼───────────┼──────────────────────────────────────────┼────────────────────────────┤\x1b[0m');

  for (const p of providers) {
    const name = p.name.padEnd(24).slice(0, 24);
    const installed = (p.installed ? '\x1b[32m  YES  \x1b[0m' : '\x1b[31m  NO   \x1b[0m');
    const ver = p.installed ? (p.version || pathBasename(p.binaryPath)).padEnd(40).slice(0, 40) : 'Not found'.padEnd(40);
    const statusColor = p.status === 'ready' ? '\x1b[32m' : (p.status === 'needs_auth' ? '\x1b[33m' : '\x1b[90m');
    const status = (statusColor + (p.statusMessage || p.status).padEnd(26).slice(0, 26) + '\x1b[0m');

    console.log(`│ ${name} │ ${installed} │ ${ver} │ ${status} │`);
  }
  console.log('\x1b[1m└──────────────────────────┴───────────┴──────────────────────────────────────────┴────────────────────────────┘\x1b[0m\n');

  const models = detector.getAvailableModels();
  console.log(`Total accessible models: \x1b[1m${models.length}\x1b[0m\n`);
}

async function runDiscover(options = {}) {
  if (!options.asJson) {
    console.log('\x1b[1m\x1b[36m=================================================================\x1b[0m');
    console.log('\x1b[1m\x1b[36m         ⚿ AGIKEY SYSTEM DISCOVERY & AGENT INSPECTION           \x1b[0m');
    console.log('\x1b[1m\x1b[36m=================================================================\x1b[0m\n');
  }

  // Force a fresh refresh and save cache
  const providers = await detector.refresh({ saveCache: true });
  const models = detector.getAvailableModels();
  const cachePath = getCacheFilePath();

  if (options.asJson) {
    const discoveryPayload = {
      timestamp: new Date().toISOString(),
      host: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cacheFile: cachePath,
      providers,
      totalModels: models.length,
      models,
    };
    console.log(JSON.stringify(discoveryPayload, null, 2));
    return;
  }

  for (const p of providers) {
    console.log(`\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
    console.log(`\x1b[1m${p.name}\x1b[0m (${p.id})`);
    console.log(`\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);

    if (!p.installed) {
      console.log(`  \x1b[31m✗ Status:\x1b[0m Not installed on system`);
      console.log(`  \x1b[90mDetails: ${p.statusMessage}\x1b[0m\n`);
      continue;
    }

    console.log(`  \x1b[32m✓ Status:\x1b[0m ${p.status.toUpperCase()} (${p.statusMessage})`);
    console.log(`  \x1b[1mBinary:\x1b[0m   ${p.binaryPath}`);
    console.log(`  \x1b[1mVersion:\x1b[0m  ${p.version || 'unknown'}`);

    const caps = [];
    if (p.capabilities.streaming) caps.push('\x1b[32m✓ SSE Streaming\x1b[0m');
    if (p.capabilities.jsonMode) caps.push('\x1b[32m✓ JSON Mode\x1b[0m');
    if (p.capabilities.reasoningEffort) caps.push('\x1b[32m✓ Reasoning Effort\x1b[0m');
    if (p.capabilities.systemPrompt) caps.push('\x1b[32m✓ System Prompts\x1b[0m');
    console.log(`  \x1b[1mFeatures:\x1b[0m ${caps.join('  ')}`);

    console.log(`  \x1b[1mModels (${p.models.length}):\x1b[0m`);
    p.models.slice(0, 8).forEach(m => {
      console.log(`    - \x1b[36m${m.id}\x1b[0m \x1b[90m(${m.name})\x1b[0m`);
    });
    if (p.models.length > 8) {
      console.log(`    \x1b[90m... and ${p.models.length - 8} more\x1b[0m`);
    }

    if (p.id === 'claude') {
      console.log(`  \x1b[33mℹ Claude Auth Note:\x1b[0m Check the active Claude Code account and billing configuration with \`claude auth status\`.`);
    } else if (p.id === 'grok' && p.status === 'needs_auth') {
      console.log(`  \x1b[33mℹ Grok Auth Note:\x1b[0m Run \`grok login\` or export \`XAI_API_KEY\` to authenticate.`);
    } else if (p.id === 'agy') {
      console.log(`  \x1b[32m✓ Ready Note:\x1b[0m Model discovery succeeded; verify generation with a test request.`);
    }

    console.log('');
  }

  console.log(`\x1b[1mSummary:\x1b[0m Discovered ${providers.filter(p => p.installed).length}/${providers.length} CLI tools, ${models.length} OpenAI-compatible model endpoints.`);
  console.log(`\x1b[32m✓ Cached discovery configuration to:\x1b[0m \x1b[4m${cachePath}\x1b[0m`);
  console.log(`\nRun \x1b[36magikey serve\x1b[0m to start the local OpenAI API endpoint at \x1b[4mhttp://127.0.0.1:8000/v1\x1b[0m.\n`);
}

async function runModels(forceRefresh = false) {
  await detector.init({ useCache: !forceRefresh, forceRefresh });
  const models = detector.getAvailableModels();
  console.log('\n\x1b[1m\x1b[36mAvailable OpenAI Models:\x1b[0m\n');
  for (const m of models) {
    console.log(`  \x1b[32m${m.id.padEnd(35)}\x1b[0m \x1b[90m(${m.owned_by})\x1b[0m ${m.description || ''}`);
  }
  console.log(`\nTotal: ${models.length} models\n`);
}

async function runConversations(asJson = false) {
  const { listConversations } = await import('../src/conversations.js');
  const res = listConversations({ limit: 100 });

  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log('\n\x1b[1m\x1b[38;5;214m⚿ Saved Conversations:\x1b[0m\n');
  if (res.data.length === 0) {
    console.log('  \x1b[90mNo conversations saved yet. Start one via /v1/conversations or agikey chat.\x1b[0m\n');
    return;
  }

  console.log('\x1b[1m┌──────────────────────────┬──────────────────────────────┬─────────────┬──────────┬──────────────────────┐\x1b[0m');
  console.log('\x1b[1m│ Conversation ID          │ Title                        │ Model       │ Messages │ Updated              │\x1b[0m');
  console.log('\x1b[1m├──────────────────────────┼──────────────────────────────┼─────────────┼──────────┼──────────────────────┤\x1b[0m');

  for (const c of res.data) {
    const id = c.id.padEnd(24).slice(0, 24);
    const title = (c.title || 'Untitled').padEnd(28).slice(0, 28);
    const model = (c.model || 'agy').padEnd(11).slice(0, 11);
    const msgs = String(c.message_count || 0).padStart(4).padEnd(8);
    const date = new Date(c.updated_at * 1000).toISOString().replace('T', ' ').slice(0, 19).padEnd(20);
    console.log(`│ \x1b[36m${id}\x1b[0m │ ${title} │ \x1b[33m${model}\x1b[0m │ ${msgs} │ \x1b[90m${date}\x1b[0m │`);
  }
  console.log('\x1b[1m└──────────────────────────┴──────────────────────────────┴─────────────┴──────────┴──────────────────────┘\x1b[0m\n');
}

async function runChat(modelName, promptText, conversationId = null) {
  const {
    getConversation,
    createConversation,
    addMessageToConversation,
  } = await import('../src/conversations.js');

  await detector.init({ useCache: true });
  let target;
  try {
    target = detector.resolveModelTarget(modelName);
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }

  let convId = conversationId;
  let messages = [];

  if (convId) {
    let conv = getConversation(convId);
    if (!conv) {
      conv = createConversation({ id: convId, model: target.provider.id });
    }
    addMessageToConversation(conv.id, { role: 'user', content: promptText });
    const fresh = getConversation(conv.id);
    messages = fresh.messages;
    convId = conv.id;
  } else {
    messages = [{ role: 'user', content: promptText }];
  }

  const { createAdapter } = await import('../src/adapters/index.js');
  const adapter = createAdapter(target.provider);

  console.log(`\x1b[90m[Using ${target.provider.name} | Model: ${target.model}${convId ? ` | Conv: ${convId}` : ''}]\x1b[0m`);
  console.log(`\x1b[1m\x1b[38;5;214m⚿ User:\x1b[0m ${promptText}\n`);
  process.stdout.write('\x1b[1m\x1b[38;5;214m⚿ Assistant:\x1b[0m ');

  let fullReply = '';
  try {
    await adapter.execute({
      messages,
      stream: true,
      model: target.model,
      onDelta: delta => {
        fullReply += delta;
        process.stdout.write(delta);
      },
    });

    if (convId) {
      addMessageToConversation(convId, { role: 'assistant', content: fullReply });
    }
    console.log('\n');
  } catch (err) {
    console.error(`\n\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let command = 'serve';
  let port = Number(process.env.PORT || 8000);
  let host = process.env.HOST || '127.0.0.1';
  let key = null;
  let model = null;
  let conversationId = null;
  let debug = false;
  let asJson = false;
  let forceRefresh = false;
  let promptText = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (command === 'chat' && i > 0 && !arg.startsWith('-')) { promptText = promptText ? `${promptText} ${arg}` : arg; continue; }
    if (arg === 'help' || arg === '--help' || arg === '-h') {
      printHelp();
      return;
    }
    if (arg === 'discover' || arg === 'scan' || arg === 'detect') {
      command = 'discover';
    } else if (arg === 'check' || arg === 'status') {
      command = 'check';
    } else if (arg === 'models') {
      command = 'models';
    } else if (arg === 'conversations' || arg === 'convs') {
      command = 'conversations';
    } else if (arg === 'chat') {
      command = 'chat';
    } else if (arg === 'clear-cache') {
      command = 'clear-cache';
    } else if (arg === 'serve' || arg === 'start') {
      command = 'serve';
    } else if (arg === '-p' || arg === '--port') {
      port = parseInt(args[++i], 10);
    } else if (arg === '--host') {
      host = args[++i];
    } else if (arg === '-k' || arg === '--key') {
      key = args[++i];
    } else if (arg === '-m' || arg === '--model') {
      model = args[++i];
    } else if (arg === '-c' || arg === '--conversation') {
      conversationId = args[++i];
    } else if (arg === '--refresh') {
      forceRefresh = true;
    } else if (arg === '--json') {
      asJson = true;
    } else if (arg === '--debug') {
      debug = true;
    } else if (!arg.startsWith('-') && command === 'chat' && !promptText) {
      promptText = arg;
    } else {
      throw new Error(`Unknown command or option: ${arg}`);
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  if (args.some((arg, i) => ['--key', '-k', '--model', '-m', '--host', '--conversation', '-c', '--port', '-p'].includes(arg) && (!args[i + 1] || args[i + 1].startsWith('--')))) throw new Error('Missing option value');

  if (debug) {
    setLogLevel(LogLevel.DEBUG);
  }

  if (asJson) {
    setLogLevel(LogLevel.ERROR);
  }

  if (command === 'discover') {
    await runDiscover({ asJson });
  } else if (command === 'clear-cache') {
    clearDiscoveryCache();
  } else if (command === 'check') {
    await runCheck(asJson, forceRefresh);
  } else if (command === 'models') {
    await runModels(forceRefresh);
  } else if (command === 'conversations') {
    await runConversations(asJson);
  } else if (command === 'chat') {
    if (!promptText) {
      console.error('\x1b[31mError: Please provide a prompt for chat.\x1b[0m Example: agikey chat "Hello!"');
      process.exit(1);
    }
    await runChat(model, promptText, conversationId);
  } else {
    const server = new AgiaryServer({
      port,
      host,
      apiKey: key || process.env.AGIKEY_API_KEY || process.env.AGIARY_API_KEY,
    });
    await server.start();
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err);
  process.exit(1);
});
