import { spawn } from 'node:child_process';
import readline from 'node:readline';

// All adapters share bounded process lifetime, cancellation, and exit handling.
export function runProcess(binary, args, { signal, onDelta, parseEvent, prompt, cwd, timeoutMs = 300000 }) {
  if (signal?.aborted) return Promise.reject(new Error('Request aborted by client'));
  return new Promise((resolve, reject) => {
    let content = '';
    let stderr = '';
    let failure = null;
    let usage = null;
    let settled = false;
    let killTimer;
    const child = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    const terminate = error => {
      failure ||= error;
      child.kill('SIGTERM');
      killTimer ||= setTimeout(() => child.kill('SIGKILL'), 1000);
      killTimer.unref();
    };
    const abort = () => terminate(new Error('Request aborted by client'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => terminate(Object.assign(new Error('Provider timed out'), { statusCode: 504 })), timeoutMs);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (error) return reject(error);
      if (!content.trim()) return reject(new Error('Provider returned no text'));
      const promptTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? Math.ceil(prompt.length / 4);
      const completionTokens = usage?.output_tokens ?? usage?.completion_tokens ?? Math.ceil(content.length / 4);
      resolve({ content: content.trim(), usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: usage?.total_tokens || promptTokens + completionTokens } });
    };
    child.on('error', finish);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16384); });
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      if (failure || !line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { return; }
      try {
        const result = parseEvent(event, content) || {};
        if (result.error) return terminate(new Error(result.error));
        if (result.usage) usage = result.usage;
        if (typeof result.text === 'string' && result.text) {
          content += result.text;
          if (content.length > 8 * 1024 * 1024) return terminate(new Error('Provider output exceeded 8 MiB'));
          onDelta?.(result.text);
        }
      } catch (error) { terminate(error); }
    });
    child.on('close', code => finish(failure || (code !== 0 ? new Error(stderr.trim() || `Provider exited with code ${code}`) : null)));
  });
}
