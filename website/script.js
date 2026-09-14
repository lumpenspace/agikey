// ---------------- Terminal Simulation Demos ----------------
const termScreen = document.getElementById('term-screen');
const termTitle = document.getElementById('term-title');
const missionList = document.getElementById('mission-list');

const DEMOS = {
  discover: {
    title: '⚿ agikey discover',
    lines: [
      { type: 'cmd', text: 'agikey discover' },
      { type: 'dim', text: '[INFO] Scanning system for AI CLIs (agy, claude, grok, codex/chatgpt)...' },
      { type: 'ok',  text: '✓ Found Antigravity CLI (agy) [1.2.2] at ~/.local/bin/agy (ready)' },
      { type: 'ok',  text: '✓ Found Claude Code [2.1.199] at ~/.nvm/.../bin/claude (ready)' },
      { type: 'amb', text: '✓ Found Grok CLI [1.0.25] at ~/.nvm/.../bin/grok (needs_auth)' },
      { type: 'ok',  text: '✓ Found Codex / ChatGPT CLI [0.149.1] at ~/.local/bin/codex (ready)' },
      { type: 'dim', text: '---------------------------------------------------------' },
      { type: 'cyan', text: 'Summary: Discovered 4/4 CLIs, 53 OpenAI-compatible model endpoints.' },
      { type: 'purple', text: '✓ Cached discovery to ~/.agikey/discovery.json' },
    ]
  },
  serve: {
    title: '⚿ agikey serve --port 8000',
    lines: [
      { type: 'cmd', text: 'agikey serve --port 8000' },
      { type: 'dim', text: '[INFO] Loaded discovery cache from ~/.agikey/discovery.json (20ms)' },
      { type: 'ok',  text: '========================================================' },
      { type: 'amber', text: '🚀 Agikey OpenAI Gateway running at:' },
      { type: 'cyan', text: '   Local API Base URL : http://127.0.0.1:8000/v1' },
      { type: 'cyan', text: '   Web Dashboard & UI : http://127.0.0.1:8000/' },
      { type: 'cyan', text: '   Health Endpoint    : http://127.0.0.1:8000/health' },
      { type: 'ok',  text: '========================================================' },
      { type: 'dim', text: 'Ready for incoming HTTP & SSE streaming connections...' }
    ]
  },
  convs: {
    title: '⚿ agikey conversations',
    lines: [
      { type: 'cmd', text: 'agikey conversations' },
      { type: 'amber', text: '⚿ Saved Conversations:' },
      { type: 'dim', text: '┌──────────────────────────┬──────────────────────────────┬─────────────┬──────────┐' },
      { type: 'dim', text: '│ Conversation ID          │ Title                        │ Model       │ Messages │' },
      { type: 'dim', text: '├──────────────────────────┼──────────────────────────────┼─────────────┼──────────┤' },
      { type: 'cyan', text: '│ conv-a1b2c3d4            │ Fix race condition in pool   │ agy         │    8     │' },
      { type: 'cyan', text: '│ conv-7e8f9a0b            │ Write AST transformer        │ claude      │   14     │' },
      { type: 'dim', text: '└──────────────────────────┴──────────────────────────────┴─────────────┴──────────┘' },
      { type: 'ok',  text: '✓ Cross-agent session persistence stored under ~/.agikey/conversations/' },
      { type: 'purple', text: 'Resume anytime: agikey chat -c conv-a1b2c3d4 "Continue refactoring"' }
    ]
  },
  stream: {
    title: '⚿ POST /v1/chat/completions (Stream)',
    lines: [
      { type: 'cmd', text: 'curl -N http://127.0.0.1:8000/v1/chat/completions \\' },
      { type: 'dim', text: '  -H "Content-Type: application/json" \\' },
      { type: 'dim', text: '  -d \'{"model":"agy","messages":[{"role":"user","content":"Say hi"}],"stream":true}\'' },
      { type: 'cyan', text: 'data: {"id":"chatcmpl-01","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}' },
      { type: 'cyan', text: 'data: {"id":"chatcmpl-01","object":"chat.completion.chunk","choices":[{"delta":{"content":" from"}}]}' },
      { type: 'cyan', text: 'data: {"id":"chatcmpl-01","object":"chat.completion.chunk","choices":[{"delta":{"content":" Agikey!"}}]}' },
      { type: 'purple', text: 'data: {"id":"chatcmpl-01","choices":[{"delta":{},"finish_reason":"stop"}]}' },
      { type: 'amber', text: 'data: [DONE]' }
    ]
  },
  models: {
    title: '⚿ agikey models',
    lines: [
      { type: 'cmd', text: 'agikey models' },
      { type: 'dim', text: '[INFO] Reading model catalog from discovery cache...' },
      { type: 'ok',  text: '  agy/gemini-3.8-flash-high       (agy) Gemini 3.8 Flash' },
      { type: 'ok',  text: '  agy/claude-sonnet-4-6           (agy) Claude Sonnet 4.6 (Thinking)' },
      { type: 'ok',  text: '  claude/claude-3-7-sonnet        (claude) Claude 3.7 Sonnet' },
      { type: 'ok',  text: '  grok/grok-4.6                   (grok) Grok 4.6 Default' },
      { type: 'ok',  text: '  codex/gpt-4o                    (codex) GPT-4o' },
      { type: 'cyan', text: 'Total: 53 accessible models across 4 installed CLI agents' }
    ]
  },
  python: {
    title: '⚿ python -c "import openai..."',
    lines: [
      { type: 'cmd', text: 'python -c "from openai import OpenAI; c = OpenAI(base_url=\'http://127.0.0.1:8000/v1\', api_key=\'agikey\'); print(c.models.list())"' },
      { type: 'dim', text: 'Connecting to local Agikey daemon at http://127.0.0.1:8000/v1...' },
      { type: 'ok',  text: 'SyncModelList(object=\'list\', data=[Model(id=\'agy\'), Model(id=\'claude\'), ...])' },
      { type: 'cyan', text: 'Status: 200 OK &bull; Response Time: 3.2ms &bull; Zero SDK adjustments' }
    ]
  }
};

let playToken = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function play(demoKey) {
  const token = ++playToken;
  const demo = DEMOS[demoKey];
  if (!demo) return;

  termTitle.textContent = demo.title;
  termScreen.innerHTML = '';

  const caret = document.createElement('span');
  caret.className = 'caret-amber';
  termScreen.appendChild(caret);

  for (const line of demo.lines) {
    if (token !== playToken) return;

    const div = document.createElement('div');
    termScreen.insertBefore(div, caret);

    if (line.type === 'cmd') {
      div.innerHTML = `<span class="t-prompt">⚿ $</span> <span class="t-cmd"></span>`;
      const target = div.querySelector('.t-cmd');
      const text = line.text;

      // Type command character by character
      for (let i = 0; i < text.length; i += 2) {
        if (token !== playToken) return;
        target.textContent += text.slice(i, i + 2);
        termScreen.scrollTop = termScreen.scrollHeight;
        await sleep(18);
      }
      await sleep(140);
    } else {
      const clsMap = {
        dim: 't-dim',
        ok: 't-ok',
        amber: 't-amber',
        cyan: 't-cyan',
        purple: 't-purple'
      };
      div.className = clsMap[line.type] || '';
      div.textContent = line.text;
      termScreen.scrollTop = termScreen.scrollHeight;
      await sleep(line.type === 'ok' ? 80 : 45);
    }
  }

  termScreen.scrollTop = termScreen.scrollHeight;
}

// Attach click listeners to mission list items
if (missionList) {
  const items = missionList.querySelectorAll('li');
  items.forEach(li => {
    li.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      li.classList.add('active');
      const demoKey = li.dataset.demo;
      play(demoKey);
    });
  });
}

// Initial render
play('discover');

// ---------------- Theme Toggle ----------------
const themeBtn = document.getElementById('theme-btn');
if (themeBtn) {
  const saved = localStorage.getItem('color-scheme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('color-scheme', next);
  });
}

// ---------------- Code Tabs ----------------
const sTabs = document.querySelectorAll('.s-tab');
const sPanes = document.querySelectorAll('.s-pane');

sTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    sTabs.forEach(b => b.classList.remove('active'));
    sPanes.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const target = document.getElementById(`pane-${btn.dataset.tab}`);
    if (target) target.classList.add('active');
  });
});

// ---------------- Copy Buttons ----------------
document.querySelectorAll('.btn-copy, .copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const copyText = btn.dataset.copy;
    const copyId = btn.dataset.copyId;
    let textToCopy = copyText;

    if (!textToCopy && copyId) {
      const el = document.getElementById(copyId);
      if (el) textToCopy = el.innerText;
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      const orig = btn.textContent;
      btn.textContent = 'COPIED!';
      btn.style.background = 'var(--green)';
      btn.style.color = '#000';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    }
  });
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[m]);
}
