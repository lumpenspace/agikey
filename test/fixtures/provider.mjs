#!/usr/bin/env node
const args = process.argv.slice(2);
const prompt = args.join(' ');
const emit = event => console.log(JSON.stringify(event));
if (prompt.includes('FIXTURE_HANG')) setInterval(() => {}, 1000);
else if (args[0] === 'exec') {
  if (!args.includes('read-only')) process.exit(2);
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello fixture' } });
  if (prompt.includes('FIXTURE_ERROR')) emit({ type: 'turn.failed', error: { message: 'fixture failure' } });
  emit({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 2 } });
} else if (args.includes('--verbose')) {
  emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } } });
  emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'fixture' } } });
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello fixture' }] } });
  emit({ type: 'result', result: prompt.includes('FIXTURE_ERROR') ? 'fixture failure' : 'Hello fixture', is_error: prompt.includes('FIXTURE_ERROR'), usage: { input_tokens: 3, output_tokens: 2 } });
} else if (args.includes('streaming-messages-json')) {
  emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello fixture' } } });
  emit({ type: 'result', result: 'Hello fixture', usage: { input_tokens: 3, output_tokens: 2 } });
} else {
  emit({ event: 'step_update', step_update: { text_delta: 'Hello fixture' } });
  emit({ event: 'result', result: { status: prompt.includes('FIXTURE_ERROR') ? 'ERROR' : 'SUCCESS', error: 'fixture failure', response: 'Hello fixture', usage: { input_tokens: 3, output_tokens: 2 } } });
}
if (prompt.includes('FIXTURE_EXIT')) process.exitCode = 1;
