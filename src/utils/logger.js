export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLevel = LogLevel.INFO;

export function setLogLevel(level) {
  if (typeof level === 'string') {
    const upper = level.toUpperCase();
    if (LogLevel[upper] !== undefined) {
      currentLevel = LogLevel[upper];
    }
  } else if (typeof level === 'number') {
    currentLevel = level;
  }
}

const recentLogs = [];
const MAX_LOGS = 200;

function log(levelStr, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const entry = { timestamp, level: levelStr, message };
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();

  const color = {
    DEBUG: '\x1b[90m',
    INFO: '\x1b[36m',
    WARN: '\x1b[33m',
    ERROR: '\x1b[31m',
  }[levelStr] || '\x1b[0m';

  console.log(`${color}[${timestamp}] [${levelStr}]\x1b[0m ${args.join(' ')}`);
}

export const logger = {
  debug(...args) {
    if (currentLevel <= LogLevel.DEBUG) log('DEBUG', ...args);
  },
  info(...args) {
    if (currentLevel <= LogLevel.INFO) log('INFO', ...args);
  },
  warn(...args) {
    if (currentLevel <= LogLevel.WARN) log('WARN', ...args);
  },
  error(...args) {
    if (currentLevel <= LogLevel.ERROR) log('ERROR', ...args);
  },
  getRecentLogs() {
    return [...recentLogs];
  },
};
