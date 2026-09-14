import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getCacheDir } from './cache.js';
import { logger } from './utils/logger.js';

export function getConversationsDir() {
  const dir = path.join(getCacheDir(), 'conversations');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createConversationId() {
  return `conv-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function createMessageId() {
  return `msg-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function sanitizeId(id) {
  if (!id || typeof id !== 'string') return null;
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function listConversations({ limit = 50, offset = 0 } = {}) {
  try {
    const dir = getConversationsDir();
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    const conversations = [];
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const conv = JSON.parse(raw);
        conversations.push({
          id: conv.id,
          object: 'conversation',
          title: conv.title || 'Untitled Conversation',
          model: conv.model || 'agy',
          created_at: conv.created_at || Math.floor(Date.now() / 1000),
          updated_at: conv.updated_at || Math.floor(Date.now() / 1000),
          message_count: Array.isArray(conv.messages) ? conv.messages.length : 0,
          metadata: conv.metadata || {},
        });
      } catch (err) {
        logger.debug(`Skipping corrupt conversation file ${file}: ${err.message}`);
      }
    }

    conversations.sort((a, b) => b.updated_at - a.updated_at);

    const paged = conversations.slice(offset, offset + limit);
    return {
      object: 'list',
      data: paged,
      total: conversations.length,
      has_more: offset + limit < conversations.length,
    };
  } catch (err) {
    logger.error(`Failed listing conversations: ${err.message}`);
    return { object: 'list', data: [], total: 0, has_more: false };
  }
}

export function getConversation(id) {
  const cleanId = sanitizeId(id);
  if (!cleanId) return null;

  try {
    const filePath = path.join(getConversationsDir(), `${cleanId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`Failed reading conversation ${id}: ${err.message}`);
    return null;
  }
}

export function createConversation({
  id = null,
  model = 'agy',
  title = null,
  messages = [],
  metadata = {},
} = {}) {
  const convId = sanitizeId(id) || createConversationId();
  const now = Math.floor(Date.now() / 1000);

  const formattedMessages = messages.map(m => ({
    id: m.id || createMessageId(),
    role: m.role || 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    created_at: m.created_at || now,
  }));

  let autoTitle = title;
  if (!autoTitle) {
    const firstUser = formattedMessages.find(m => m.role === 'user');
    if (firstUser && firstUser.content) {
      autoTitle = firstUser.content.slice(0, 48).trim().replace(/\n+/g, ' ');
    } else {
      autoTitle = 'New Conversation';
    }
  }

  const conversation = {
    id: convId,
    object: 'conversation',
    title: autoTitle,
    model,
    created_at: now,
    updated_at: now,
    messages: formattedMessages,
    metadata,
  };

  try {
    const filePath = path.join(getConversationsDir(), `${convId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf8');
    logger.info(`Conversation created: ${convId} ("${autoTitle}")`);
    return conversation;
  } catch (err) {
    logger.error(`Failed creating conversation ${convId}: ${err.message}`);
    throw err;
  }
}

export function addMessageToConversation(id, message) {
  let conv = getConversation(id);
  if (!conv) {
    conv = createConversation({ id, model: message.model || 'agy' });
  }

  const now = Math.floor(Date.now() / 1000);
  const newMsg = {
    id: message.id || createMessageId(),
    role: message.role || 'user',
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    created_at: message.created_at || now,
  };

  conv.messages.push(newMsg);
  conv.updated_at = now;

  if (conv.title === 'New Conversation' && newMsg.role === 'user' && newMsg.content) {
    conv.title = newMsg.content.slice(0, 48).trim().replace(/\n+/g, ' ');
  }

  try {
    const filePath = path.join(getConversationsDir(), `${conv.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(conv, null, 2), 'utf8');
    return { message: newMsg, conversation: conv };
  } catch (err) {
    logger.error(`Failed adding message to conversation ${conv.id}: ${err.message}`);
    throw err;
  }
}

export function updateConversation(id, { title = null, metadata = null, model = null } = {}) {
  const conv = getConversation(id);
  if (!conv) return null;

  if (title !== null) conv.title = title;
  if (model !== null) conv.model = model;
  if (metadata !== null) conv.metadata = { ...conv.metadata, ...metadata };
  conv.updated_at = Math.floor(Date.now() / 1000);

  try {
    const filePath = path.join(getConversationsDir(), `${conv.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(conv, null, 2), 'utf8');
    return conv;
  } catch (err) {
    logger.error(`Failed updating conversation ${conv.id}: ${err.message}`);
    throw err;
  }
}

export function deleteConversation(id) {
  const cleanId = sanitizeId(id);
  if (!cleanId) return false;

  try {
    const filePath = path.join(getConversationsDir(), `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Conversation deleted: ${cleanId}`);
      return true;
    }
  } catch (err) {
    logger.error(`Failed deleting conversation ${cleanId}: ${err.message}`);
  }
  return false;
}
