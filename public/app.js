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

function renderProviders(providers) {
  const container = document.getElementById('providers-grid');
  container.innerHTML = '';

  providers.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card provider-card';

    let statusBadgeClass = 'badge-danger';
    let statusText = 'Not Installed';

    if (p.installed) {
      if (p.status === 'ready') {
        statusBadgeClass = 'badge-success';
        statusText = 'Ready';
      } else if (p.status === 'needs_auth') {
        statusBadgeClass = 'badge-warning';
        statusText = 'Needs Auth';
      } else {
        statusBadgeClass = 'badge-info';
        statusText = 'Installed';
      }
    }

    const shortId = p.id;
    const initial = p.name.charAt(0).toUpperCase();

    card.innerHTML = `
      <div>
        <div class="provider-header">
          <div class="provider-title-group">
            <div class="provider-icon ${shortId}">${initial}</div>
            <div>
              <h3 style="font-size: 1rem; font-weight: 600;">${p.name}</h3>
              <span class="text-muted" style="font-size: 0.78rem;">ID: <code>${p.id}</code></span>
            </div>
          </div>
          <span class="badge ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="provider-details" style="margin-top: 14px;">
          <div class="detail-row">
            <span class="detail-label">Status Msg:</span>
            <span class="detail-value" style="font-family: inherit; font-size: 0.8rem;">${p.statusMessage || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Version:</span>
            <span class="detail-value">${p.version ? p.version.split('\n')[0] : 'N/A'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Binary:</span>
            <span class="detail-value" title="${p.binaryPath || 'None'}">${p.binaryPath ? p.binaryPath.split('/').pop() : 'None'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Models:</span>
            <span class="detail-value">${p.models ? p.models.length : 0} available</span>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button class="btn secondary ping-btn" data-provider="${p.id}" style="width: 100%; font-size: 0.8rem;" ${!p.installed ? 'disabled' : ''}>
          ⚡ Test in Playground
        </button>
      </div>
    `;

    container.appendChild(card);
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
      const payload = {
        model,
        messages,
        stream: isStream,
        temperature,
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

// Initialize on page load
loadStatus();
