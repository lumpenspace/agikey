import { AgyAdapter } from './agy.js';
import { ClaudeAdapter } from './claude.js';
import { GrokAdapter } from './grok.js';
import { CodexAdapter } from './codex.js';

export function createAdapter(providerInfo) {
  if (!providerInfo) {
    throw new Error('Provider info is required to create adapter.');
  }

  switch (providerInfo.id) {
    case 'agy':
      return new AgyAdapter(providerInfo);
    case 'claude':
      return new ClaudeAdapter(providerInfo);
    case 'grok':
      return new GrokAdapter(providerInfo);
    case 'codex':
      return new CodexAdapter(providerInfo);
    default:
      throw new Error(`Unknown provider: ${providerInfo.id}`);
  }
}
