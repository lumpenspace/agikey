// Theme Toggle
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

// Copy Buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.dataset.clipboard;
    navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.background = 'var(--brand-green)';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
      btn.style.color = '';
    }, 1500);
  });
});

// Code Snippets Copy Buttons
document.querySelectorAll('.copy-snippet-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      navigator.clipboard.writeText(targetEl.innerText);
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = orig;
      }, 1500);
    }
  });
});

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.code-tab-pane');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const tabId = `pane-${btn.dataset.tab}`;
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');
  });
});

// Simulated Terminal Stream Demo
const terminalBody = document.getElementById('terminal-body');
if (terminalBody) {
  const simulatedResponses = [
    'def fibonacci(n):',
    '    if n <= 1: return n',
    '    return fibonacci(n - 1) + fibonacci(n - 2)',
  ];

  let lineIdx = 0;
  function streamSimulation() {
    if (lineIdx < simulatedResponses.length) {
      const newLine = document.createElement('div');
      newLine.className = 'term-line text-cyan';
      newLine.textContent = `data: {"delta": "${simulatedResponses[lineIdx]}"}`;
      const cursor = terminalBody.querySelector('.term-cursor');
      if (cursor && cursor.parentElement) {
        cursor.parentElement.after(newLine);
      } else {
        terminalBody.appendChild(newLine);
      }
      lineIdx++;
      setTimeout(streamSimulation, 1200);
    }
  }
  setTimeout(streamSimulation, 2500);
}
