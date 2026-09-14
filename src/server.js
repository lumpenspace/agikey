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
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export class AgiaryServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 8000;
    this.host = options.host || process.env.HOST || '127.0.0.1';
    this.apiKey = options.apiKey || process.env.AGIARY_API_KEY || null;
    this.server = null;
    this.requestHistory = [];
    this.MAX_HISTORY = 100;
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
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
        body += chunk;
        if (body.length > 20 * 1024 * 1024) { // 20 MB limit
          reject(new Error('Request payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON body: ${err.message}`));
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

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
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
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    // Status endpoint (all providers info)
    if (req.method === 'GET' && (pathname === '/api/status' || pathname === '/v1/status')) {
      return this.sendJson(res, 200, {
        providers: detector.getAllProviders(),
        modelsCount: detector.getAvailableModels().length,
        timestamp: new Date().toISOString(),
      });
    }

    // Force re-scan of CLI providers
    if (req.method === 'POST' && pathname === '/api/check') {
      const providers = await detector.refresh();
      return this.sendJson(res, 200, {
        status: 'ok',
        providers,
        modelsCount: detector.getAvailableModels().length,
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
    if (pathname.startsWith('/v1/') && !this.checkAuth(req)) {
      return this.sendError(res, 401, 'Incorrect or missing API key', 'unauthorized', 'invalid_api_key');
    }

    // GET /v1/models
    if (req.method === 'GET' && pathname === '/v1/models') {
      const models = detector.getAvailableModels();
      return this.sendJson(res, 200, {
        object: 'list',
        data: models,
      });
    }

    // GET /v1/models/:model
    if (req.method === 'GET' && pathname.startsWith('/v1/models/')) {
      const modelId = decodeURIComponent(pathname.slice('/v1/models/'.length));
      const models = detector.getAvailableModels();
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
        return this.sendError(res, 400, err.message, 'invalid_request_error');
      }

      const {
        model,
        messages,
        stream = false,
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
        resolvedTarget = detector.resolveModelTarget(model);
      } catch (err) {
        return this.sendError(res, 404, err.message, 'model_not_found');
      }

      const { provider, model: targetModel } = resolvedTarget;
      const completionId = createCompletionId('chatcmpl');
      const responseModel = model || `${provider.id}/${targetModel}`;

      logger.info(`ChatCompletion [${stream ? 'STREAM' : 'SYNC'}]: provider=${provider.id} model=${targetModel} messages=${messages.length}`);

      const adapter = createAdapter(provider);
      const abortController = new AbortController();
      req.on('close', () => {
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
        writeSSEChunk(res, formatChatChunk({
          id: completionId,
          model: responseModel,
          delta: { role: 'assistant', content: '' },
        }));

        let accumulatedTokens = 0;

        try {
          const result = await adapter.execute({
            messages,
            stream: true,
            model: targetModel,
            temperature,
            maxTokens: max_tokens || max_completion_tokens,
            reasoningEffort: reasoning_effort,
            responseFormat: response_format,
            signal: abortController.signal,
            onDelta: delta => {
              writeSSEChunk(res, formatChatChunk({
                id: completionId,
                model: responseModel,
                delta: { content: delta },
              }));
            },
          });

          accumulatedTokens = result.usage?.total_tokens || 0;

          // Final chunk
          writeSSEChunk(res, formatChatChunk({
            id: completionId,
            model: responseModel,
            delta: {},
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
          messages,
          stream: false,
          model: targetModel,
          temperature,
          maxTokens: max_tokens || max_completion_tokens,
          reasoningEffort: reasoning_effort,
          responseFormat: response_format,
          signal: abortController.signal,
        });

        const responseObj = formatChatResponse({
          id: completionId,
          model: responseModel,
          content: result.content,
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
        return this.sendError(res, 400, err.message, 'invalid_request_error');
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
        resolvedTarget = detector.resolveModelTarget(model);
      } catch (err) {
        return this.sendError(res, 404, err.message, 'model_not_found');
      }

      const { provider, model: targetModel } = resolvedTarget;
      const completionId = createCompletionId('cmpl');
      const responseModel = model || `${provider.id}/${targetModel}`;

      logger.info(`TextCompletion [${stream ? 'STREAM' : 'SYNC'}]: provider=${provider.id} model=${targetModel}`);

      const adapter = createAdapter(provider);
      const abortController = new AbortController();
      req.on('close', () => {
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
    await detector.refresh();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          logger.error('Unhandled request exception:', err);
          if (!res.headersSent) {
            this.sendError(res, 500, `Internal Server Error: ${err.message}`);
          }
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
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
