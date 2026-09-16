import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detector } from './detector.js';
import { createAdapter } from './adapters/index.js';
import {
  createCompletionId,
  writeSSEChunk,
  writeSSEDone,
  formatChatChunk,
  formatChatResponse,
  formatTextChunk,
  formatTextResponse,
} from './utils/sse.js';
import { validateBody } from './utils/validation.js';
import { logger } from './utils/logger.js';

import {
  listConversations,
  getConversation,
  createConversation,
  addMessageToConversation,
  updateConversation,
  deleteConversation,
} from './conversations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export class AgiaryServer {
  constructor(options = {}) {
    this.port = options.port ?? Number(process.env.PORT || 8000);
    this.host = options.host || process.env.HOST || '127.0.0.1';
    this.apiKey = options.apiKey ?? process.env.AGIKEY_API_KEY ?? process.env.AGIARY_API_KEY ?? null;
    this.detector = options.detector || detector;
    this.createAdapter = options.createAdapter || createAdapter;
    this.server = null;
    this.requestHistory = [];
    this.activeConversations = new Set();
    this.MAX_HISTORY = 100;
  }

  acquireConversation(id, res) {
    if (this.activeConversations.has(id)) {
      this.sendError(res, 409, 'Conversation already has a running turn', 'conflict');
      return false;
    }
    this.activeConversations.add(id);
    const release = () => this.activeConversations.delete(id);
    res.once('finish', release);
    res.once('close', release);
    return true;
  }

  logRequest(reqInfo) {
    this.requestHistory.unshift({
      id: reqInfo.id || createCompletionId('req'),
      timestamp: new Date().toISOString(),
      method: reqInfo.method,
      path: reqInfo.path,
      model: reqInfo.model || '-',
      stream: Boolean(reqInfo.stream),
      durationMs: reqInfo.durationMs || 0,
      statusCode: reqInfo.statusCode || 200,
      tokens: reqInfo.tokens || 0,
      error: reqInfo.error || null,
    });
    if (this.requestHistory.length > this.MAX_HISTORY) {
      this.requestHistory.pop();
    }
  }

  setCorsHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  }

  sendJson(res, statusCode, data) {
    this.setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  }

  sendError(res, statusCode, message, type = 'api_error', code = null) {
    logger.error(`HTTP ${statusCode} [${type}]: ${message}`);
    this.sendJson(res, statusCode, {
      error: {
        message,
        type,
        param: null,
        code: code || String(statusCode),
      },
    });
  }

  checkAuth(req) {
    if (!this.apiKey) return true;
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match && match[1] === this.apiKey;
  }

  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        if (body === null) return;
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024) { // 20 MB limit
          body = null;
          reject(Object.assign(new Error('Request payload too large (1 MiB limit)'), { statusCode: 413 }));
        }
      });
      req.on('end', () => {
        if (body === null) return;
        if (!body) return resolve({});
        try {
          const value = JSON.parse(body);
          validateBody(value);
          resolve(value);
        } catch (err) {
          reject(err.statusCode ? err : new Error(`Invalid JSON body: ${err.message}`));
        }
      });
      req.on('error', reject);
    });
  }

  serveStaticFile(res, filePath, contentType) {
    try {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  }

  async handleRequest(req, res) {
    this.setCorsHeaders(res);

    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      return this.sendError(res, 403, 'Cross-origin browser requests are disabled', 'forbidden');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (['127.0.0.1', 'localhost', '::1'].includes(this.host)) {
      const requestHost = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(requestHost)) return this.sendError(res, 403, 'Unrecognized Host header', 'forbidden');
    }
    const startTime = Date.now();
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    logger.debug(`${req.method} ${pathname}`);

    // Public / Static Assets
    if (req.method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        return this.serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
      }
      if (pathname === '/style.css') {
        return this.serveStaticFile(res, path.join(PUBLIC_DIR, 'style.css'), 'text/css; charset=utf-8');
      }
      if (pathname === '/app.js') {
        return this.serveStaticFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
      }
    }

    // Health check
    if (req.method === 'GET' && pathname === '/health') {
      return this.sendJson(res, 200, {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        version: '1.0.1',
        timestamp: new Date().toISOString(),
      });
    }

    // Protect management endpoints as well as completions and conversations.
    if ((pathname.startsWith('/v1/') || pathname.startsWith('/api/')) && !this.checkAuth(req)) {
      return this.sendError(res, 401, 'Incorrect or missing API key', 'unauthorized', 'invalid_api_key');
    }

    // Status endpoint (all providers info)
    if (req.method === 'GET' && (pathname === '/api/status' || pathname === '/v1/status')) {
      return this.sendJson(res, 200, {
        providers: this.detector.getAllProviders(),
        modelsCount: this.detector.getAvailableModels().length,
        timestamp: new Date().toISOString(),
      });
    }

    // Force re-scan of CLI providers
    if (req.method === 'POST' && pathname === '/api/check') {
      const providers = await this.detector.refresh();
      return this.sendJson(res, 200, {
        status: 'ok',
        providers,
        modelsCount: this.detector.getAvailableModels().length,
      });
    }

    // Recent Request Logs
    if (req.method === 'GET' && pathname === '/api/logs') {
      return this.sendJson(res, 200, {
        logs: this.requestHistory,
        serverLogs: logger.getRecentLogs(),
      });
    }

    // Check Auth for API routes
    if ((pathname.startsWith('/v1/') || pathname.startsWith('/api/v1/')) && !this.checkAuth(req)) {
      return this.sendError(res, 401, 'Incorrect or missing API key', 'unauthorized', 'invalid_api_key');
    }

    // -------------------------------------------------------------
    // Conversations Endpoints (/v1/conversations & /api/v1/conversations)
    // -------------------------------------------------------------

    // GET /v1/conversations or GET /api/v1/conversations (List conversations)
    if (req.method === 'GET' && (pathname === '/v1/conversations' || pathname === '/api/v1/conversations')) {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
      const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) return this.sendError(res, 400, 'Invalid pagination', 'invalid_request_error');
      return this.sendJson(res, 200, listConversations({ limit, offset }));
    }

    // POST /v1/conversations or POST /api/v1/conversations (Create conversation)
    if (req.method === 'POST' && (pathname === '/v1/conversations' || pathname === '/api/v1/conversations')) {
      let body = {};
      try {
        body = await this.parseBody(req);
      } catch (err) {
        return this.sendError(res, err.statusCode || 400, err.message, 'invalid_request_error');
      }
      const conv = createConversation(body);
      return this.sendJson(res, 201, conv);
    }

    // Sub-resource: /v1/conversations/:id/messages
    const convMessagesMatch = pathname.match(/^\/(?:api\/)?v1\/conversations\/([^/]+)\/messages\/?$/);
    if (convMessagesMatch) {
      const convId = decodeURIComponent(convMessagesMatch[1]);

      // GET /v1/conversations/:id/messages
      if (req.method === 'GET') {
        const conv = getConversation(convId);
        if (!conv) {
          return this.sendError(res, 404, `Conversation '${convId}' not found`, 'invalid_request_error', 'conversation_not_found');
        }
        return this.sendJson(res, 200, {
          object: 'list',
          conversation_id: convId,
          data: conv.messages,
        });
      }

      // POST /v1/conversations/:id/messages (Append message & execute turn)
      if (req.method === 'POST') {
        let body;
        try {
          body = await this.parseBody(req);
        } catch (err) {
          return this.sendError(res, err.statusCode || 400, err.message, 'invalid_request_error');
        }

        const userContent = body.content || body.message?.content || body.messages?.at(-1)?.content;
        if (typeof userContent !== 'string' || !userContent.trim()) {
          return this.sendError(res, 400, "Missing text 'content' or 'messages'.", 'invalid_request_error');
        }
        const existing = getConversation(convId);
        const targetModelId = body.model || existing?.model || 'auto';
        let resolvedTarget;
        try {
          resolvedTarget = this.detector.resolveModelTarget(targetModelId);
        } catch (err) {
          return this.sendError(res, 404, err.message, 'model_not_found');
        }
        const { provider, model: targetModel } = resolvedTarget;
        if (!this.acquireConversation(convId, res)) return;
        if (!existing) createConversation({ id: convId, model: targetModelId });
        addMessageToConversation(convId, { role: 'user', content: userContent });
        const updatedConv = getConversation(convId);
        const completionId = createCompletionId('convmsg');
        const responseModel = targetModelId;
        const stream = Boolean(body.stream);

        logger.info(`ConversationMessage [${stream ? 'STREAM' : 'SYNC'}]: conv=${convId} provider=${provider.id} model=${targetModel}`);

        const adapter = this.createAdapter(provider);
        const abortController = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) abortController.abort();
        });

        if (stream) {
          this.setCorsHeaders(res);
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          });

          writeSSEChunk(res, {
            id: completionId,
            conversation_id: convId,
            object: 'conversation.message.chunk',
            delta: { role: 'assistant', content: '' },
          });

          let accumulated = '';
          try {
            const result = await adapter.execute({
              messages: updatedConv.messages,
              stream: true,
              model: targetModel,
              temperature: body.temperature,
              maxTokens: body.max_tokens,
              reasoningEffort: body.reasoning_effort,
              responseFormat: body.response_format,
              signal: abortController.signal,
              onDelta: delta => {
                accumulated += delta;
                writeSSEChunk(res, {
                  id: completionId,
                  conversation_id: convId,
                  object: 'conversation.message.chunk',
                  delta: { content: delta },
                });
              },
            });

            const finalText = accumulated || result.content || '';
            addMessageToConversation(convId, { role: 'assistant', content: finalText });

            writeSSEChunk(res, {
              id: completionId,
              conversation_id: convId,
              object: 'conversation.message.chunk',
              delta: {},
              finish_reason: 'stop',
            });
            writeSSEDone(res);
            res.end();
            return;
          } catch (err) {
            logger.error(`Error in streaming conversation message: ${err.message}`);
            writeSSEChunk(res, { error: { message: err.message, type: 'api_error' } });
            writeSSEDone(res);
            res.end();
            return;
          }
        } else {
          // Non-streaming
          try {
            const result = await adapter.execute({
              messages: updatedConv.messages,
              stream: false,
              model: targetModel,
              temperature: body.temperature,
              maxTokens: body.max_tokens,
              reasoningEffort: body.reasoning_effort,
              responseFormat: body.response_format,
              signal: abortController.signal,
            });

            const finalReply = result.content || '';
            addMessageToConversation(convId, { role: 'assistant', content: finalReply });
            const freshConv = getConversation(convId);

            return this.sendJson(res, 200, {
              id: completionId,
              conversation_id: convId,
              object: 'conversation.message',
              created: Math.floor(Date.now() / 1000),
              model: responseModel,
              role: 'assistant',
              content: finalReply,
              usage: result.usage,
              conversation: freshConv,
            });
          } catch (err) {
            return this.sendError(res, 500, err.message, 'api_error');
          }
        }
      }
    }

    // Resource: /v1/conversations/:id
    const singleConvMatch = pathname.match(/^\/(?:api\/)?v1\/conversations\/([^/]+)\/?$/);
    if (singleConvMatch) {
      const convId = decodeURIComponent(singleConvMatch[1]);

      // GET /v1/conversations/:id
      if (req.method === 'GET') {
        const conv = getConversation(convId);
        if (!conv) {
          return this.sendError(res, 404, `Conversation '${convId}' not found`, 'invalid_request_error', 'conversation_not_found');
        }
        return this.sendJson(res, 200, conv);
      }

      if (req.method !== 'GET' && this.activeConversations.has(convId)) return this.sendError(res, 409, 'Conversation has a running turn', 'conflict');

      // PATCH or POST /v1/conversations/:id (Update conversation)
      if (req.method === 'PATCH' || req.method === 'POST') {
        let body = {};
        try {
          body = await this.parseBody(req);
        } catch (err) {
          return this.sendError(res, err.statusCode || 400, err.message, 'invalid_request_error');
        }
        const conv = updateConversation(convId, body);
        if (!conv) {
          return this.sendError(res, 404, `Conversation '${convId}' not found`, 'invalid_request_error', 'conversation_not_found');
        }
        return this.sendJson(res, 200, conv);
      }

      // DELETE /v1/conversations/:id (Delete conversation)
      if (req.method === 'DELETE') {
        const deleted = deleteConversation(convId);
        if (!deleted) {
          return this.sendError(res, 404, `Conversation '${convId}' not found`, 'invalid_request_error', 'conversation_not_found');
        }
        return this.sendJson(res, 200, { id: convId, object: 'conversation.deleted', deleted: true });
      }
    }

    // GET /v1/models
    if (req.method === 'GET' && pathname === '/v1/models') {
      const models = this.detector.getAvailableModels();
      return this.sendJson(res, 200, {
        object: 'list',
        data: models,
      });
    }

    // GET /v1/models/:model
    if (req.method === 'GET' && pathname.startsWith('/v1/models/')) {
      const modelId = decodeURIComponent(pathname.slice('/v1/models/'.length));
      const models = this.detector.getAvailableModels();
      const found = models.find(m => m.id === modelId);
      if (!found) {
        return this.sendError(res, 404, `Model '${modelId}' not found`, 'invalid_request_error', 'model_not_found');
      }
      return this.sendJson(res, 200, found);
    }

    // POST /v1/chat/completions
    if (req.method === 'POST' && pathname === '/v1/chat/completions') {
      let body;
      try {
        body = await this.parseBody(req);
      } catch (err) {
        return this.sendError(res, err.statusCode || 400, err.message, 'invalid_request_error');
      }

      const {
        model,
        messages,
        stream = false,
        conversation_id,
        temperature,
        max_tokens,
        max_completion_tokens,
        reasoning_effort,
        response_format,
      } = body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return this.sendError(res, 400, "Missing required parameter 'messages'. Must be a non-empty array.", 'invalid_request_error');
      }

      let resolvedTarget;
      try {
        resolvedTarget = this.detector.resolveModelTarget(model || (conversation_id && getConversation(conversation_id)?.model));
      } catch (err) {
        return this.sendError(res, 404, err.message, 'model_not_found');
      }

      const { provider, model: targetModel } = resolvedTarget;

      let effectiveMessages = messages;
      if (conversation_id) {
        if (!this.acquireConversation(conversation_id, res)) return;
        let existingConv = getConversation(conversation_id);
        if (!existingConv) {
          existingConv = createConversation({ id: conversation_id, model: model || provider.id });
        }
        for (const m of messages) {
          addMessageToConversation(conversation_id, m);
        }
        const updated = getConversation(conversation_id);
        if (updated && updated.messages.length > 0) {
          effectiveMessages = updated.messages;
        }
      }

      const completionId = createCompletionId('chatcmpl');
      const responseModel = model || `${provider.id}/${targetModel}`;

      logger.info(`ChatCompletion [${stream ? 'STREAM' : 'SYNC'}]: provider=${provider.id} model=${targetModel} messages=${effectiveMessages.length}${conversation_id ? ` conv=${conversation_id}` : ''}`);

      const adapter = this.createAdapter(provider);
      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      if (stream) {
        // SSE Streaming Mode
        this.setCorsHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Initial chunk announcing role
        const initChunk = formatChatChunk({
          id: completionId,
          model: responseModel,
          delta: { role: 'assistant', content: '' },
        });
        if (conversation_id) initChunk.conversation_id = conversation_id;
        writeSSEChunk(res, initChunk);

        let accumulatedTokens = 0;
        let accumulatedText = '';

        try {
          const result = await adapter.execute({
            messages: effectiveMessages,
            stream: true,
            model: targetModel,
            temperature,
            maxTokens: max_tokens || max_completion_tokens,
            reasoningEffort: reasoning_effort,
            responseFormat: response_format,
            signal: abortController.signal,
            onDelta: delta => {
              accumulatedText += delta;
              const chunk = formatChatChunk({
                id: completionId,
                model: responseModel,
                delta: { content: delta },
              });
              if (conversation_id) chunk.conversation_id = conversation_id;
              writeSSEChunk(res, chunk);
            },
          });

          accumulatedTokens = result.usage?.total_tokens || 0;
          const finalText = accumulatedText || result.content || '';
          if (conversation_id) {
            addMessageToConversation(conversation_id, { role: 'assistant', content: finalText });
          }

          // Final chunk
          const finChunk = formatChatChunk({
            id: completionId,
            model: responseModel,
            delta: {},
            finishReason: 'stop',
            usage: result.usage,
          });
          if (conversation_id) finChunk.conversation_id = conversation_id;
          writeSSEChunk(res, finChunk);

          writeSSEDone(res);
          res.end();

          this.logRequest({
            id: completionId,
            method: 'POST',
            path: pathname,
            model: responseModel,
            stream: true,
            durationMs: Date.now() - startTime,
            statusCode: 200,
            tokens: accumulatedTokens,
          });
        } catch (err) {
          logger.error(`Error in streaming chat: ${err.message}`);
          writeSSEChunk(res, {
            error: {
              message: err.message,
              type: err.code || 'api_error',
              code: err.statusCode || 500,
            },
          });
          writeSSEDone(res);
          res.end();

          this.logRequest({
            id: completionId,
            method: 'POST',
            path: pathname,
            model: responseModel,
            stream: true,
            durationMs: Date.now() - startTime,
            statusCode: err.statusCode || 500,
            error: err.message,
          });
        }
        return;
      }

      // Non-Streaming Mode
      try {
        const result = await adapter.execute({
          messages: effectiveMessages,
          stream: false,
          model: targetModel,
          temperature,
          maxTokens: max_tokens || max_completion_tokens,
          reasoningEffort: reasoning_effort,
          responseFormat: response_format,
          signal: abortController.signal,
        });

        if (conversation_id) {
          addMessageToConversation(conversation_id, { role: 'assistant', content: result.content });
        }

        const responseObj = formatChatResponse({
          id: completionId,
          model: responseModel,
          content: result.content,
          finishReason: 'stop',
          usage: result.usage,
        });
        if (conversation_id) {
          responseObj.conversation_id = conversation_id;
        }

        this.sendJson(res, 200, responseObj);

        this.logRequest({
          id: completionId,
          method: 'POST',
          path: pathname,
          model: responseModel,
          stream: false,
          durationMs: Date.now() - startTime,
          statusCode: 200,
          tokens: result.usage?.total_tokens || 0,
        });
      } catch (err) {
        const statusCode = err.statusCode || 500;
        this.sendError(res, statusCode, err.message, err.code || 'api_error');
        this.logRequest({
          id: completionId,
          method: 'POST',
          path: pathname,
          model: responseModel,
          stream: false,
          durationMs: Date.now() - startTime,
          statusCode,
          error: err.message,
        });
      }
      return;
    }

    // POST /v1/completions (Legacy completions mode)
    if (req.method === 'POST' && pathname === '/v1/completions') {
      let body;
      try {
        body = await this.parseBody(req);
      } catch (err) {
        return this.sendError(res, err.statusCode || 400, err.message, 'invalid_request_error');
      }

      const {
        model,
        prompt,
        stream = false,
        temperature,
        max_tokens,
      } = body;

      if (!prompt) {
        return this.sendError(res, 400, "Missing required parameter 'prompt'.", 'invalid_request_error');
      }

      let resolvedTarget;
      try {
        resolvedTarget = this.detector.resolveModelTarget(model);
      } catch (err) {
        return this.sendError(res, 404, err.message, 'model_not_found');
      }

      const { provider, model: targetModel } = resolvedTarget;
      const completionId = createCompletionId('cmpl');
      const responseModel = model || `${provider.id}/${targetModel}`;

      logger.info(`TextCompletion [${stream ? 'STREAM' : 'SYNC'}]: provider=${provider.id} model=${targetModel}`);

      const adapter = this.createAdapter(provider);
      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      if (stream) {
        this.setCorsHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        try {
          const result = await adapter.execute({
            prompt,
            stream: true,
            model: targetModel,
            temperature,
            maxTokens: max_tokens,
            reasoningEffort: body.reasoning_effort,
            responseFormat: body.response_format,
            signal: abortController.signal,
            onDelta: delta => {
              writeSSEChunk(res, formatTextChunk({
                id: completionId,
                model: responseModel,
                text: delta,
              }));
            },
          });

          writeSSEChunk(res, formatTextChunk({
            id: completionId,
            model: responseModel,
            text: '',
            finishReason: 'stop',
            usage: result.usage,
          }));
          writeSSEDone(res);
          res.end();

          this.logRequest({
            id: completionId,
            method: 'POST',
            path: pathname,
            model: responseModel,
            stream: true,
            durationMs: Date.now() - startTime,
            statusCode: 200,
            tokens: result.usage?.total_tokens || 0,
          });
        } catch (err) {
          writeSSEChunk(res, {
            error: { message: err.message, type: 'api_error' },
          });
          writeSSEDone(res);
          res.end();
        }
        return;
      }

      try {
        const result = await adapter.execute({
          prompt,
          stream: false,
          model: targetModel,
          temperature,
          maxTokens: max_tokens,
          reasoningEffort: body.reasoning_effort,
          responseFormat: body.response_format,
          signal: abortController.signal,
        });

        const responseObj = formatTextResponse({
          id: completionId,
          model: responseModel,
          text: result.content,
          finishReason: 'stop',
          usage: result.usage,
        });

        this.sendJson(res, 200, responseObj);
        this.logRequest({
          id: completionId,
          method: 'POST',
          path: pathname,
          model: responseModel,
          stream: false,
          durationMs: Date.now() - startTime,
          statusCode: 200,
          tokens: result.usage?.total_tokens || 0,
        });
      } catch (err) {
        const statusCode = err.statusCode || 500;
        this.sendError(res, statusCode, err.message, err.code || 'api_error');
      }
      return;
    }

    // 404
    return this.sendError(res, 404, `Not Found: ${req.method} ${pathname}`, 'invalid_request_error');
  }

  async start() {
    if (!['127.0.0.1', 'localhost', '::1'].includes(this.host) && !this.apiKey) {
      throw new Error('Binding beyond loopback requires AGIKEY_API_KEY or --key');
    }
    await this.detector.init();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          logger.error('Unhandled request exception:', err);
          if (!res.headersSent) {
            this.sendError(res, err.statusCode || 500, err.message, err.statusCode ? 'invalid_request_error' : 'api_error');
          }
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
        this.port = this.server.address().port;
        logger.info(`========================================================`);
        logger.info(`🚀 Agikey (Agiary) OpenAI API Gateway running at:`);
        logger.info(`   Local API Base URL : http://${this.host}:${this.port}/v1`);
        logger.info(`   Web Dashboard & UI : http://${this.host}:${this.port}/`);
        logger.info(`   Health Endpoint    : http://${this.host}:${this.port}/health`);
        logger.info(`========================================================`);
        resolve(this);
      });
    });
  }

  async stop() {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      this.server.close(err => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

export { AgiaryServer as AgikeyServer };
