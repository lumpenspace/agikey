// Theme Management (following modern web guidance)
const themeBtn = document.getElementById('theme-toggle');
function initTheme() {
  const saved = localStorage.getItem('color-scheme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
}
initTheme();

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('color-scheme', next);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = next;
});

// Tab Navigation
const tabButtons = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = `tab-${btn.dataset.tab}`;
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    if (btn.dataset.tab === 'logs') {
      loadLogs();
    }
    if (btn.dataset.tab === 'conversations') {
      loadConversations();
    }
  });
});

// Endpoint Copy Button
const copyEndpointBtn = document.getElementById('copy-endpoint-btn');
copyEndpointBtn.addEventListener('click', () => {
  navigator.clipboard.writeText('http://127.0.0.1:8000/v1');
  copyEndpointBtn.style.color = 'var(--brand-success)';
  setTimeout(() => {
    copyEndpointBtn.style.color = '';
  }, 1500);
});

// Copy code buttons in Docs tab
document.querySelectorAll('.copy-code-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const el = document.getElementById(targetId);
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      const originalText = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = originalText; }, 1500);
    }
  });
});

// Providers State
let providersData = [];
let modelsData = [];

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    providersData = data.providers || [];
    renderProviders(providersData);
    await loadModels();
  } catch (err) {
    console.error('Failed to load status:', err);
  }
}

const LOGOS = {
  agy: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#gem-grad-app)"/><defs><linearGradient id="gem-grad-app" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#4E8CFF"/><stop offset="0.5" stop-color="#B77BFF"/><stop offset="1" stop-color="#FF6B99"/></linearGradient></defs></svg>`,
  claude: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#D97757"><path d="M12 2.5a1.2 1.2 0 0 1 1.15.86l1.37 4.8 4.8-1.37a1.2 1.2 0 0 1 1.49 1.49l-1.37 4.8 4.8 1.37a1.2 1.2 0 0 1 0 2.3l-4.8 1.37 1.37 4.8a1.2 1.2 0 0 1-1.49 1.49l-4.8-1.37-1.37 4.8a1.2 1.2 0 0 1-2.3 0l-1.37-4.8-4.8 1.37a1.2 1.2 0 0 1-1.49-1.49l1.37-4.8-4.8-1.37a1.2 1.2 0 0 1 0-2.3l4.8-1.37-1.37-4.8a1.2 1.2 0 0 1 1.49-1.49l4.8 1.37 1.37-4.8A1.2 1.2 0 0 1 12 2.5z"/></svg>`,
  grok: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  codex: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#10A37F"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.08 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.493zm-9.66-4.665a4.474 4.474 0 0 1-.534-3.012l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.842-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.49a4.5 4.5 0 0 1-6.14-1.725zM2.34 8.946a4.47 4.47 0 0 1 2.346-2.024v5.676a.79.79 0 0 0 .393.681l5.842 3.37-2.02 1.168a.078.078 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 8.946zm16.597 3.855l-5.843-3.37 2.02-1.168a.078.078 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.68zM20.177 6.47a4.476 4.476 0 0 1 .535 3.013l-.142-.085-4.783-2.759a.77.77 0 0 0-.78 0l-5.842 3.37V7.676a.08.08 0 0 1 .033-.062l4.84-2.798a4.5 4.5 0 0 1 6.14 1.725zM12 13.578l-2.484-1.434 2.484-1.434 2.484 1.434L12 13.578z"/></svg>`
};

function renderProviders(providers) {
  const tbody = document.getElementById('providers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  providers.forEach(p => {
    const tr = document.createElement('tr');

    let statusPill = `<span class="badge badge-danger">Not Found</span>`;
    if (p.installed) {
      if (p.status === 'ready') {
        statusPill = `<span class="badge badge-success">✓ Ready</span>`;
      } else if (p.status === 'needs_auth') {
        statusPill = `<span class="badge badge-warning">⚡ Needs Auth</span>`;
      } else {
        statusPill = `<span class="badge badge-info">● Installed</span>`;
      }
    }

    const logoSvg = LOGOS[p.id] || `<span class="provider-fallback">${p.id.charAt(0).toUpperCase()}</span>`;
    const binName = p.binaryPath ? p.binaryPath.split('/').pop() : 'none';
    const modelsCount = p.models ? p.models.length : 0;
    const topModel = p.models && p.models[0] ? p.models[0].id : '';

    const reasoningSupport = p.id === 'agy' ? '✓ low|med|high' : (p.id === 'grok' || p.id === 'codex' ? '✓ Supported' : '—');
    const schemaSupport = p.capabilities && p.capabilities.jsonSchema ? '✓ Supported' : (p.id === 'claude' || p.id === 'agy' || p.id === 'grok' || p.id === 'codex' ? '✓ Supported' : '—');

    tr.innerHTML = `
      <td>
        <div class="table-brand-cell">
          <div class="llm-logo-box ${p.id}">${logoSvg}</div>
          <div>
            <strong>${p.name}</strong>
            <span class="text-muted" style="display:block; font-size: 0.74rem;">${p.version ? p.version.split('\n')[0] : 'v1.0'}</span>
          </div>
        </div>
      </td>
      <td><code>${binName}</code></td>
      <td>
        <span class="badge badge-info">${modelsCount} models</span>
        ${topModel ? `<div class="text-muted" style="font-size: 0.72rem; margin-top: 3px;">${topModel}</div>` : ''}
      </td>
      <td><span class="text-success">✓ Full</span></td>
      <td><span class="text-success">✓ Full</span></td>
      <td><span class="text-success">✓ SSE</span></td>
      <td><span class="text-muted">${reasoningSupport}</span></td>
      <td><span class="text-muted">${schemaSupport}</span></td>
      <td>${statusPill}</td>
      <td>
        <button class="btn secondary ping-btn" data-provider="${p.id}" style="padding: 4px 10px; font-size: 0.78rem;" ${!p.installed ? 'disabled' : ''}>
          Test
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach test buttons
  document.querySelectorAll('.ping-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provId = btn.dataset.provider;
      switchToPlayground(provId);
    });
  });
}

async function loadModels() {
  try {
    const res = await fetch('/v1/models');
    const json = await res.json();
    modelsData = json.data || [];

    const select = document.getElementById('model-select');
    select.innerHTML = '';

    // Group models by provider
    const groups = {};
    modelsData.forEach(m => {
      const prov = m.owned_by || 'other';
      if (!groups[prov]) groups[prov] = [];
      groups[prov].push(m);
    });

    for (const [prov, models] of Object.entries(groups)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = prov.toUpperCase();
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id + (m.description ? ` (${m.description})` : '');
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    }

    // Default to agy if present
    if (select.querySelector('option[value="agy"]')) {
      select.value = 'agy';
    }
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

document.getElementById('refresh-providers-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-providers-btn');
  btn.disabled = true;
  btn.innerHTML = 'Scanning...';
  try {
    const res = await fetch('/api/check', { method: 'POST' });
    const data = await res.json();
    providersData = data.providers || [];
    renderProviders(providersData);
    await loadModels();
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Re-scan System`;
  }
});

function switchToPlayground(providerId) {
  // Click playground tab
  const playTab = document.querySelector('[data-tab="playground"]');
  if (playTab) playTab.click();

  const select = document.getElementById('model-select');
  if (select) {
    const targetOpt = select.querySelector(`option[value="${providerId}"]`);
    if (targetOpt) {
      select.value = providerId;
    }
  }
}

// Interactive Playground Functionality
const apiModeSelect = document.getElementById('api-mode-select');
const modelSelect = document.getElementById('model-select');
const streamToggle = document.getElementById('stream-toggle');
const reasoningSelect = document.getElementById('reasoning-effort-select');
const tempInput = document.getElementById('temperature-input');
const tempVal = document.getElementById('temp-val');
const maxTokensInput = document.getElementById('max-tokens-input');
const systemPromptInput = document.getElementById('system-prompt-input');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat-btn');
const chatHistory = document.getElementById('chat-history');
const streamIndicator = document.getElementById('stream-indicator');
const metricsRow = document.getElementById('metrics-row');
const metricLatency = document.getElementById('metric-latency');
const metricPromptTokens = document.getElementById('metric-prompt-tokens');
const metricCompTokens = document.getElementById('metric-comp-tokens');

tempInput.addEventListener('input', () => {
  tempVal.textContent = tempInput.value;
});

streamToggle.addEventListener('change', () => {
  streamIndicator.textContent = streamToggle.checked ? 'Streaming Active' : 'Non-Streaming (Sync)';
  streamIndicator.className = streamToggle.checked ? 'badge badge-info' : 'badge badge-warning';
});

apiModeSelect.addEventListener('change', () => {
  const isChat = apiModeSelect.value === 'chat';
  document.getElementById('playground-mode-title').textContent = isChat ? 'Chat Conversation' : 'Text Completion';
  document.getElementById('system-prompt-group').style.display = isChat ? 'flex' : 'none';
});

clearChatBtn.addEventListener('click', () => {
  chatHistory.innerHTML = `
    <div class="chat-placeholder">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>Send a message below to test your local AI CLI endpoints through standard OpenAI API formatting.</p>
    </div>
  `;
  metricsRow.style.display = 'none';
});

// Send Message Flow
sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

let isGenerating = false;

async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || isGenerating) return;

  // Clear placeholder if present
  const placeholder = chatHistory.querySelector('.chat-placeholder');
  if (placeholder) placeholder.remove();

  // Append user message bubble
  appendMessage('user', text);
  promptInput.value = '';

  const isChat = apiModeSelect.value === 'chat';
  const isStream = streamToggle.checked;
  const model = modelSelect.value || 'agy';
  const reasoning = reasoningSelect.value || null;
  const temperature = parseFloat(tempInput.value) || 0.7;
  const maxTokens = maxTokensInput.value ? parseInt(maxTokensInput.value, 10) : null;
  const systemPrompt = systemPromptInput.value.trim();

  // Prepare Assistant bubble
  const assistantBubble = appendMessage('assistant', '');
  const contentEl = assistantBubble.querySelector('.message-text');
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  contentEl.appendChild(cursor);

  isGenerating = true;
  sendBtn.disabled = true;
  metricsRow.style.display = 'flex';
  const startTime = Date.now();

  try {
    if (isChat) {
      // Build messages array
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // Gather existing history from DOM
      const existingBubbles = chatHistory.querySelectorAll('.message-bubble');
      existingBubbles.forEach(b => {
        if (b === assistantBubble) return;
        const role = b.classList.contains('user') ? 'user' : 'assistant';
        const msgText = b.querySelector('.message-text').innerText;
        messages.push({ role, content: msgText });
      });

      const endpoint = '/v1/chat/completions';
      const convId = convSessionSelect ? convSessionSelect.value : null;
      const payload = {
        model,
        messages,
        stream: isStream,
        temperature,
        ...(convId && { conversation_id: convId }),
        ...(maxTokens && { max_tokens: maxTokens }),
        ...(reasoning && { reasoning_effort: reasoning }),
      };

      if (isStream) {
        await handleStreamingResponse(endpoint, payload, contentEl, cursor, startTime);
      } else {
        await handleSyncChatResponse(endpoint, payload, contentEl, cursor, startTime);
      }
    } else {
      // Text Completion (/v1/completions)
      const endpoint = '/v1/completions';
      const payload = {
        model,
        prompt: text,
        stream: isStream,
        temperature,
        ...(maxTokens && { max_tokens: maxTokens }),
      };

      if (isStream) {
        await handleStreamingTextResponse(endpoint, payload, contentEl, cursor, startTime);
      } else {
        await handleSyncTextResponse(endpoint, payload, contentEl, cursor, startTime);
      }
    }
  } catch (err) {
    cursor.remove();
    contentEl.innerHTML = `<span style="color: var(--brand-danger);"><strong>Error:</strong> ${escapeHtml(err.message)}</span>`;
  } finally {
    cursor.remove();
    isGenerating = false;
    sendBtn.disabled = false;
    promptInput.focus();
    if (typeof loadConversations === 'function') {
      loadConversations();
    }
  }
}

async function handleStreamingResponse(endpoint, payload, contentEl, cursor, startTime) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `HTTP ${res.status}: ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';
  let promptTokens = 0;
  let compTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.error) {
            throw new Error(parsed.error.message);
          }
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            contentEl.textContent = accumulated;
            contentEl.appendChild(cursor);
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || 0;
            compTokens = parsed.usage.completion_tokens || 0;
          }
        } catch (e) {
          if (e.message !== 'Unexpected end of JSON input') {
            console.warn('SSE parse error:', e, jsonStr);
          }
        }
      }
    }
  }

  const duration = Date.now() - startTime;
  metricLatency.textContent = duration;
  metricPromptTokens.textContent = promptTokens || Math.ceil(payload.messages.length * 8);
  metricCompTokens.textContent = compTokens || Math.ceil(accumulated.length / 4);
}

async function handleSyncChatResponse(endpoint, payload, contentEl, cursor, startTime) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - startTime;
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error?.message || `HTTP ${res.status}: ${res.statusText}`);
  }

  const content = json.choices?.[0]?.message?.content || '';
  cursor.remove();
  contentEl.textContent = content;

  metricLatency.textContent = duration;
  metricPromptTokens.textContent = json.usage?.prompt_tokens || 0;
  metricCompTokens.textContent = json.usage?.completion_tokens || 0;
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function handleStreamingTextResponse(endpoint, payload, contentEl, cursor, startTime) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const text = parsed.choices?.[0]?.text || '';
          if (text) {
            accumulated += text;
            contentEl.textContent = accumulated;
            contentEl.appendChild(cursor);
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
        } catch {}
      }
    }
  }

  metricLatency.textContent = Date.now() - startTime;
}

async function handleSyncTextResponse(endpoint, payload, contentEl, cursor, startTime) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - startTime;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);

  cursor.remove();
  contentEl.textContent = json.choices?.[0]?.text || '';
  metricLatency.textContent = duration;
  metricPromptTokens.textContent = json.usage?.prompt_tokens || 0;
  metricCompTokens.textContent = json.usage?.completion_tokens || 0;
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function appendMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${role}`;

  const author = document.createElement('div');
  author.className = 'message-author';
  author.textContent = role === 'user' ? 'You' : 'Assistant';

  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  textEl.textContent = text;

  bubble.appendChild(author);
  bubble.appendChild(textEl);
  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  return bubble;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[m]);
}

// Logs Viewer
async function loadLogs() {
  const tbody = document.getElementById('logs-tbody');
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    const logs = data.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-muted text-center">No API calls recorded yet. Send a request from the playground or via curl!</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(l => {
      const tr = document.createElement('tr');
      const time = new Date(l.timestamp).toLocaleTimeString();
      const statusBadge = l.statusCode === 200
        ? '<span class="badge badge-success">200 OK</span>'
        : `<span class="badge badge-danger">${l.statusCode} ERR</span>`;
      const mode = l.stream ? 'SSE Stream' : 'Sync JSON';

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">${time}</td>
        <td><strong>${l.method}</strong></td>
        <td><code>${l.path}</code></td>
        <td><code>${l.model}</code></td>
        <td>${mode}</td>
        <td>${statusBadge}</td>
        <td>${l.durationMs}ms</td>
        <td>${l.tokens}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

document.getElementById('refresh-logs-btn')?.addEventListener('click', loadLogs);

// -----------------------------------------------------------------
// Conversations Management
// -----------------------------------------------------------------
const convSessionSelect = document.getElementById('conv-session-select');
const newConvBtn = document.getElementById('new-conv-btn');
const refreshConvsBtn = document.getElementById('refresh-convs-btn');
const newConvTabBtn = document.getElementById('new-conv-tab-btn');
const convsTbody = document.getElementById('conversations-tbody');

async function loadConversations() {
  try {
    const res = await fetch('/v1/conversations');
    const data = await res.json();
    const convs = data.data || [];
    renderConversationsTable(convs);
    renderConversationsDropdown(convs);
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderConversationsDropdown(convs) {
  if (!convSessionSelect) return;
  const currentVal = convSessionSelect.value;
  convSessionSelect.innerHTML = '<option value="">(New ephemeral session)</option>';

  convs.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const shortTitle = c.title.length > 28 ? c.title.slice(0, 28) + '...' : c.title;
    opt.textContent = `${shortTitle} (${c.id.slice(0, 10)})`;
    if (c.id === currentVal) opt.selected = true;
    convSessionSelect.appendChild(opt);
  });
}

function renderConversationsTable(convs) {
  if (!convsTbody) return;
  if (convs.length === 0) {
    convsTbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding: 24px;">No saved conversations yet. Start a conversation in the Playground or via the API!</td></tr>`;
    return;
  }

  convsTbody.innerHTML = '';
  convs.forEach(c => {
    const tr = document.createElement('tr');
    const dateStr = new Date(c.updated_at * 1000).toLocaleString();
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.title || 'Untitled')}</strong></td>
      <td><code>${c.id}</code></td>
      <td><span class="badge badge-info">${escapeHtml(c.model || 'agy')}</span></td>
      <td><span class="badge badge-success">${c.message_count} msgs</span></td>
      <td class="text-muted" style="font-size: 0.82rem;">${dateStr}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn secondary resume-conv-btn" data-id="${c.id}" style="padding: 4px 10px; font-size: 0.78rem;">
            Resume
          </button>
          <button class="btn secondary delete-conv-btn" data-id="${c.id}" style="padding: 4px 10px; font-size: 0.78rem; color: var(--brand-danger);">
            Delete
          </button>
        </div>
      </td>
    `;
    convsTbody.appendChild(tr);
  });

  // Attach action listeners
  document.querySelectorAll('.resume-conv-btn').forEach(b => {
    b.addEventListener('click', () => resumeConversationInPlayground(b.dataset.id));
  });

  document.querySelectorAll('.delete-conv-btn').forEach(b => {
    b.addEventListener('click', () => handleDeleteConversation(b.dataset.id));
  });
}

async function resumeConversationInPlayground(convId) {
  try {
    const res = await fetch(`/v1/conversations/${convId}`);
    if (!res.ok) throw new Error('Conversation not found');
    const conv = await res.json();

    // Switch to playground tab
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    const playTabBtn = document.querySelector('.nav-tab[data-tab="playground"]');
    const playContent = document.getElementById('tab-playground');
    if (playTabBtn) playTabBtn.classList.add('active');
    if (playContent) playContent.classList.add('active');

    // Update session select
    if (convSessionSelect) {
      if (!Array.from(convSessionSelect.options).some(o => o.value === convId)) {
        const opt = document.createElement('option');
        opt.value = convId;
        opt.textContent = `${conv.title} (${convId.slice(0, 10)})`;
        convSessionSelect.appendChild(opt);
      }
      convSessionSelect.value = convId;
    }

    // Set model if valid
    if (conv.model && modelSelect) {
      if (Array.from(modelSelect.options).some(o => o.value === conv.model)) {
        modelSelect.value = conv.model;
      }
    }

    // Render past messages
    chatHistory.innerHTML = '';
    if (Array.isArray(conv.messages) && conv.messages.length > 0) {
      conv.messages.forEach(m => {
        appendMessage(m.role, m.content);
      });
    } else {
      chatHistory.innerHTML = `
        <div class="chat-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>Conversation <code>${convId}</code> loaded with 0 messages. Type below to begin!</p>
        </div>
      `;
    }
  } catch (err) {
    alert(`Could not load conversation: ${err.message}`);
  }
}

async function handleDeleteConversation(convId) {
  if (!confirm(`Are you sure you want to delete conversation ${convId}?`)) return;

  try {
    const res = await fetch(`/v1/conversations/${convId}`, { method: 'DELETE' });
    if (res.ok) {
      if (convSessionSelect && convSessionSelect.value === convId) {
        startNewConversation();
      }
      await loadConversations();
    } else {
      alert('Failed to delete conversation');
    }
  } catch (err) {
    alert(`Error deleting conversation: ${err.message}`);
  }
}

function startNewConversation() {
  if (convSessionSelect) convSessionSelect.value = '';
  chatHistory.innerHTML = `
    <div class="chat-placeholder">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>Send a message below to test your local AI CLI endpoints through standard OpenAI API formatting.</p>
    </div>
  `;
  if (promptInput) promptInput.focus();
}

convSessionSelect?.addEventListener('change', () => {
  const val = convSessionSelect.value;
  if (val) {
    resumeConversationInPlayground(val);
  } else {
    startNewConversation();
  }
});

newConvBtn?.addEventListener('click', () => {
  startNewConversation();
});

newConvTabBtn?.addEventListener('click', () => {
  tabButtons.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));
  const playTabBtn = document.querySelector('.nav-tab[data-tab="playground"]');
  const playContent = document.getElementById('tab-playground');
  if (playTabBtn) playTabBtn.classList.add('active');
  if (playContent) playContent.classList.add('active');
  startNewConversation();
});

refreshConvsBtn?.addEventListener('click', loadConversations);

// Initialize on page load
loadStatus();
loadConversations();

