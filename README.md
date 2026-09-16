# Agikey

**Your agents. One local API.**

Agikey (formerly Agiary) is a local HTTP gateway for **agy, Claude Code, Grok, and Codex**. It exposes a subset of OpenAI's text chat/completions interface and includes a dashboard for discovery, prompts, and saved conversations. It uses native Node.js modules with **zero runtime dependencies**.

The gateway runs locally; provider CLIs still contact their own services. An installed CLI and working provider authentication are prerequisites. Discovery is not proof that generation works.

## Install and run

Requires Node.js 18 or later and macOS or Linux. Use a maintained Node.js release. Windows has not been validated.

**Publication status:** `agikey` and `agiary` returned 404 from the public npm registry on September 16, 2026. This repository prepares the package `agikey@1.0.1`; it is not published yet. Both `agikey` and `agiary` commands are included in that single package.

Until publication, install from source:

```sh
git clone https://github.com/lumpenspace/agikey.git
cd agikey
npm test
npm link
agikey discover
agikey serve
```

Open **http://127.0.0.1:8000** for the local dashboard. The API base is **http://127.0.0.1:8000/v1**. `node bin/agikey.js` also works without linking.

Use `agikey chat -m agy "Reply with hello"` to check generation after discovery. Provider errors (authentication, credits, incompatible models, CLI version) are surfaced to the caller.

## Connect

Install the OpenAI SDK in your client application, not in this gateway.

### Python

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="local")
response = client.chat.completions.create(
    model="agy",
    messages=[{"role": "user", "content": "Say hello."}],
)
print(response.choices[0].message.content)
```

### JavaScript / streaming

```js
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8000/v1',
  apiKey: 'local',
});
const stream = await client.chat.completions.create({
  model: 'agy',
  messages: [{ role: 'user', content: 'Say hello.' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

If a server key is configured, replace `local` with that key.

```sh
curl -N http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"agy","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

## Compatibility

This is a **text generation compatibility layer**, not a complete implementation of the OpenAI API. Clients must use Chat Completions or legacy Completions, not the Responses API.

| Surface | Behavior |
| --- | --- |
| `GET /v1/models` | Installed provider aliases and discovery model catalog; catalog entries do not guarantee account access |
| `POST /v1/chat/completions` | Text `messages`, `model`, `stream`; user, assistant, system, developer roles |
| `POST /v1/completions` | One string `prompt`, `model`, `stream`; prompt arrays/batches are rejected |
| Streaming | SSE with `[DONE]`; provider errors appear as `error` events; chunk granularity depends on CLI events |
| `reasoning_effort` | `low`, `medium`, `high` mapped to provider flags/config; actual model support varies |
| `response_format` | `json_object` / `json_schema` passed to agy, Claude and Grok flags; not supported by the Codex adapter; not independently schema-validated by Agikey |
| Usage | CLI-reported counts when available; otherwise estimated at approximately four characters per token; not billing-grade |
| Unsupported | Responses API, embeddings, images/audio, tool-call protocol, batches, sampling controls, token limits |

`temperature`, `top_p`, `max_tokens`, `max_completion_tokens`, `tools`, `tool_choice`, `n`, `stop`, `seed`, `logprobs`, and frequency/presence penalties are rejected with HTTP 400 rather than silently ignored.

Use `agy`, `claude`, `grok`, `codex` (or `chatgpt`) to select a provider default. Use `provider/model-id` to request a specific model. Bare known model IDs are supported; unknown IDs are rejected. Claude uses its `sonnet` alias. Codex uses the configured local model. Model availability is controlled by the upstream service.

System and developer instructions are passed through the CLI prompt interface; role hierarchy and tokenization are not identical to the OpenAI service. Claude and Grok get separate system instructions. Other adapters include instructions in the text prompt.

### Live verification (September 16, 2026)

| Provider | Installed version | JSON / SSE result |
| --- | --- | --- |
| agy | 1.2.4 | Both passed; exact `AGIKEY_OK` response |
| Claude Code | 2.1.199 | Both blocked by provider credit balance |
| Grok | 1.0.25 | Not run: authentication required |
| Codex | 0.149.1 | Both blocked: configured model requires a newer CLI |

All four adapters have isolated event/parser tests. That is separate from live provider verification. Structured-output and reasoning controls still need live validation before being advertised as verified.

## Commands and configuration

```text
agikey discover                 Scan providers and save discovery cache
agikey check [--refresh]         Inspect discovery (cached by default)
agikey models                   List discovered model IDs
agikey serve                    Start API + dashboard (default command)
agikey chat -m agy "Hello"       Make a provider request directly
agikey chat -c my-thread "Hello" Save/continue local conversation text
agikey conversations            List saved conversations
agikey clear-cache              Remove discovery cache
agikey --help                   Show command help
```

| Option / environment | Default |
| --- | --- |
| `--port`, `-p` / `PORT` | `8000` |
| `--host` / `HOST` | `127.0.0.1` (`-h` means help) |
| `--key`, `-k` / `AGIKEY_API_KEY` | No key on loopback; legacy `AGIARY_API_KEY` also accepted |
| `AGIKEY_HOME` | `~/.agikey` (cache and conversations) |
| `--json` | JSON output for discover/check/conversations |
| `--debug` | Diagnostic logging |

Discovery cache expires after 24 hours. `agikey discover` or the dashboard's rescan refreshes it. Server startup uses the cache when available.

## Conversations

Conversation APIs are Agikey extensions, not standard OpenAI endpoints. Saved text is replayed on each turn; these are not native provider sessions. Send only **new** messages with `conversation_id`, otherwise you will duplicate history. Simultaneous turns or edits to a running conversation return HTTP 409 within one server process.

```sh
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"agy","conversation_id":"my-thread","messages":[{"role":"user","content":"Remember the word cedar."}]}'

curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"conversation_id":"my-thread","messages":[{"role":"user","content":"What was the word?"}]}'
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET / POST | `/v1/conversations` | List / create |
| GET / PATCH / DELETE | `/v1/conversations/:id` | Read / update title, metadata, model / delete |
| GET / POST | `/v1/conversations/:id/messages` | Read / submit a user turn with `{ "content": "Hello", "stream": true }` |

`/api/v1/conversations` is an alias. IDs allow 1–128 letters, numbers, underscores, or hyphens. Creating an existing ID returns 409. History remains on disk until deleted. A failed generation can leave the submitted user message in history, but does not save partial output as a completed assistant turn. Retrying the same message can therefore duplicate it.

## Local access and process behavior

The server binds to loopback by default. All `/api/*` and `/v1/*` routes require a Bearer token when a key is configured; `/health` and dashboard assets remain public. Enter the key in the dashboard's **Server API key** field; it stays in page memory. Cross-origin browser requests and unexpected loopback Host headers are rejected.

```sh
AGIKEY_API_KEY='choose-a-long-random-secret' agikey serve
```

Binding beyond loopback requires a key. This is a local development tool, not an internet-facing multi-user service: no TLS termination, per-user storage, rate limiting, or tenant isolation is provided. Keep access limited to trusted clients. Provider processes inherit the environment and working directory. Claude/Grok are launched with tools disabled; Codex uses a read-only sandbox. Provider configuration still applies; Agikey itself is not an OS sandbox.

Requests are limited to 1 MiB. Provider execution times out after five minutes and is terminated on client disconnect. Conversations use private file permissions and atomic replacement. Use one gateway process per data directory.

## Development and checks

```sh
npm test                 # Isolated fixtures; no accounts, quota or user cache
npm run test:live         # Explicit opt-in: calls installed authenticated providers
npm run test:live -- agy  # Limit live calls to one provider
npm run release:check     # Tests + tarball contents + clean local install smoke
npm run site:preview      # Website at http://127.0.0.1:4173
```

Live tests may use provider quota. They run temporary storage and report failures separately from skipped providers. See [launch status](docs/LAUNCH.md), [release procedure](docs/RELEASING.md), and [contributing](CONTRIBUTING.md).

The marketing site is static HTML/CSS/JavaScript under `website/`, with existing Vercel configuration. It does not run the gateway or make requests to local agents. The runtime dashboard is under `public/` and ships in the npm package.

## License

[MIT](LICENSE). Independent community project; not affiliated with the CLI providers.
