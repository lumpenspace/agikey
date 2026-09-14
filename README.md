# Agikey (Agiary)

> **OpenAI-Compatible Local API Gateway and Dashboard for AI Coding CLIs**  
> Turn your locally installed AI agents (**Claude Code**, **agy**, **Grok**, and **Codex/ChatGPT**) into unified OpenAI API endpoints (`/v1/chat/completions`, `/v1/completions`, `/v1/models`).

---

## Features

- 🔍 **Separate Discovery Command (`agikey discover`)**: Deeply inspects your system for installed AI coding agent CLIs, probes paths, versions, auth status, available models, and caches results to `~/.agikey/discovery.json` for lightning-fast server startup.
- ⚡ **OpenAI Drop-In Compatibility**: Use your favorite OpenAI SDKs (Python, Node.js), HTTP clients (`curl`), or IDE extensions (Cursor, Continue.dev, OpenWebUI) by simply setting `base_url="http://127.0.0.1:8000/v1"`.
- 🔄 **The Two Core API Modes**:
  - **Chat Completions Mode (`/v1/chat/completions`)**: Accepts standard multi-turn `messages: [{ role, content }]` arrays.
  - **Text Completions Mode (`/v1/completions`)**: Accepts single string or array `prompt` for legacy tools and completion models.
- 🌊 **The Two Streaming Modes**:
  - **Streaming Mode (`stream: true`)**: Real-time Server-Sent Events (SSE) streaming token chunks (`data: {...}\n\n`) ending with `data: [DONE]`.
  - **Non-Streaming Mode (`stream: false`)**: Blocking JSON response formatted according to the standard OpenAI `chat.completion` schema.
- ⚙️ **Rich OpenAI Parameters Supported**:
  - `model`: Target a specific provider (`agy`, `claude`, `grok`, `codex`, `chatgpt`) or a model ID (`gemini-3.8-flash-high`, `claude-3-7-sonnet`, `grok-4.6`, `o3-mini`, etc.).
  - `reasoning_effort`: `low`, `medium`, `high` (mapped to `agy --effort`, `grok --reasoning-effort`, and Codex reasoning effort).
  - `response_format`: Structured JSON mode (`{"type": "json_object"}` or schema) mapped to CLI `--json-schema`.
  - `temperature`, `max_tokens` / `max_completion_tokens`.
  - `system` / developer prompt injection.
- 🖥️ **Modern Web Dashboard & Playground**: Served at `http://localhost:8000/` with light/dark theme support, live provider status cards, real-time streaming chat playground, copy-pasteable SDK snippets, and live request audit logs.
- 🪶 **Zero External Runtime Dependencies**: Built with native Node.js 24 ES modules, HTTP server, and child processes. Starts in ~20ms.

---

## Quick Start

### 1. Run Discovery & Caching

Scan your machine for installed CLIs and cache the configuration:

```bash
# Run deep discovery and cache results
./bin/agikey.js discover

# Or output pure JSON
./bin/agikey.js discover --json
```

Output example:
```
=================================================================
         🔍 AGIKEY SYSTEM DISCOVERY & AGENT INSPECTION           
=================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antigravity CLI (agy) (agy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Status: READY (Ready to serve)
  Binary:   /Users/username/.local/bin/agy
  Version:  1.2.2
  Features: ✓ SSE Streaming  ✓ JSON Mode  ✓ Reasoning Effort  ✓ System Prompts
  Models (14):
    - gemini-3.8-flash-high (Gemini 3.8 Flash (High))
    - claude-sonnet-4-6 (Claude Sonnet 4.6 (Thinking))
    ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude Code (claude)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Status: READY (Installed)
  Binary:   /Users/username/.nvm/versions/node/v24.15.0/bin/claude
  Version:  2.1.199 (Claude Code)
  Features: ✓ SSE Streaming  ✓ JSON Mode  ✓ System Prompts
  Models (4):
    - claude-3-7-sonnet (Claude 3.7 Sonnet)
    ...

✓ Cached discovery configuration to: ~/.agikey/discovery.json
```

### 2. Start the Local API Server & Dashboard

```bash
# Start server on default port 8000
npm start
# or
./bin/agikey.js serve --port 8000
```

Open your browser at **`http://localhost:8000/`** to view the interactive dashboard.

---

## CLI Usage

```bash
agikey [command] [options]

COMMANDS:
  discover, scan, detect    Deep discovery of installed AI CLIs & cache results
  serve, start              Start the local API gateway & web dashboard (default)
  check, status             Quick CLI status check (reads from cache or system)
  models                    List all available OpenAI model IDs
  conversations, convs      List saved multi-turn conversations
  chat [prompt]             Send a quick prompt via the CLI
  clear-cache               Remove ~/.agikey/discovery.json cache

OPTIONS:
  -p, --port <number>       Port to listen on (default: 8000, env: PORT)
  -h, --host <ip>           Host to bind to (default: 127.0.0.1, env: HOST)
  -k, --key <string>        Require Bearer API key (optional, env: AGIKEY_API_KEY)
  -m, --model <name>        Target model (default: auto)
  -c, --conversation <id>   Continue an existing persistent conversation thread
  --refresh                 Bypass cache and force fresh scan
  --json                    Output results as JSON
  --debug                   Enable verbose debug logging
```

---

## Connecting Clients to the Local API

### Python (`openai` package)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key="agikey"  # any placeholder key
)

# 1. Non-Streaming Chat Completion
response = client.chat.completions.create(
    model="agy",  # or "claude", "grok", "codex", "gemini-3.8-flash-high"
    messages=[
        {"role": "system", "content": "You are a concise coding assistant."},
        {"role": "user", "content": "Write an async sleep function in Python."}
    ],
    stream=False
)
print(response.choices[0].message.content)

# 2. Real-Time Streaming
stream = client.chat.completions.create(
    model="agy",
    messages=[{"role": "user", "content": "Explain merge sort."}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Node.js / TypeScript (`openai` package)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:8000/v1',
  apiKey: 'agikey',
});

// Streaming chat completion
const stream = await openai.chat.completions.create({
  model: 'agy',
  messages: [{ role: 'user', content: 'Say hello in 3 languages.' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### cURL

```bash
# Real-time SSE Streaming
curl -N http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agy",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Non-Streaming Sync
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agy",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": false
  }'

# Text / Legacy Completions Mode
curl http://127.0.0.1:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agy",
    "prompt": "Complete this poem: Roses are red, violets are",
    "stream": false
  }'
```

### Continue.dev / Cursor IDE Configuration

Add to your Continue `config.json` or Cursor custom OpenAI model configuration:

```json
{
  "models": [
    {
      "title": "Agikey Local Agent",
      "provider": "openai",
      "model": "agy",
      "apiBase": "http://127.0.0.1:8000/v1",
      "apiKey": "agikey"
    }
  ]
}
```

---

## Persistent Conversations & Sessions

Agikey supports persistent multi-turn conversational threads stored locally under `~/.agikey/conversations/`. This enables maintaining context across turns regardless of which CLI agent handles them:

### Endpoints:
- `GET /v1/conversations` (or `/api/v1/conversations`): List all saved conversations.
- `POST /v1/conversations`: Create a new conversation thread.
- `GET /v1/conversations/:id`: Retrieve conversation details and turn history.
- `PATCH /v1/conversations/:id`: Update title or metadata.
- `DELETE /v1/conversations/:id`: Delete a conversation thread.
- `GET /v1/conversations/:id/messages`: Get messages for a thread.
- `POST /v1/conversations/:id/messages`: Append user message and run agent turn (supports streaming SSE or sync JSON).

### Session Continuity via OpenAI Chat Completions:
Pass `"conversation_id"` in `POST /v1/chat/completions` to automatically persist the turn and build on earlier history:

```bash
curl -N http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agy",
    "conversation_id": "conv-a1b2c3d4",
    "messages": [{"role": "user", "content": "How do I optimize this function?"}],
    "stream": true
  }'
```

Or directly in the CLI:
```bash
agikey chat -c conv-a1b2c3d4 "Continue refactoring"
agikey convs
```

---

## Claude Desktop vs Claude Code CLI Note

If your Claude Code CLI reports:
> `Credit balance is too low`

This occurs because:
1. **Claude Desktop** uses your consumer subscription (**Claude Pro** or **Claude Max**) via browser/app authentication.
2. **Claude Code CLI** connects by default to Anthropic's developer API console credits (`ANTHROPIC_API_KEY` or console login). If that developer prepaid balance is \$0, the Anthropic server returns `Credit balance is too low`.
3. To link your Claude Pro/Max subscription directly to Claude Code CLI, Anthropic provides:
   ```bash
   claude setup-token
   ```
4. Alternatively, you can use **agy** in Agikey right away: `agy` is fully active on your system and provides access to Gemini 3.8 and Claude Sonnet/Opus models!

---

## Testing

Agikey includes a comprehensive automated test suite testing the CLI detector, discovery caching, messages conversion, SSE formatting, and live server endpoints (`/v1/models`, `/v1/chat/completions`, `/v1/completions` in both streaming and sync modes):

```bash
npm test
```

---

## License

MIT
