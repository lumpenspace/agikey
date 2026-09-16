# Launch readiness — September 16, 2026

## Decision

**Agikey 1.0.1 is published on npm, and the website is live at https://agikey.hyperplex.org.** The code, package and website have been improved and tested. A four-provider live-verified launch is still gated by account/CLI issues below. These are not hidden behind passing fixture tests.

The source repository is public at https://github.com/lumpenspace/agikey. The public npm registry confirms `agikey@1.0.1`, and `npm exec --yes --package=agikey@1.0.1 -- agikey --help` succeeded outside the repository after publication.

## Verification performed

- 72 isolated tests covering request/response shapes, chat/text/conversation SSE, conversation CRUD and history, concurrent-turn rejection, management authentication, hostile origins/Host headers, body limits, validation, duplicate creation, provider event parsing, partial failures, cancellation and timeout.
- All 72 tests passed on Node 18, 20, 22 and 24 locally. No skipped or cancelled tests in any run.
- Official JavaScript `openai@7.15.0` SDK smoke: model list, JSON chat, streamed chat, legacy completions and HTTP error handling against a local server with a fixture CLI. This checks the SDK wire format, not provider access. Python snippets have not been executed.
- Tarball contents audited against an explicit allowlist; clean temporary global install; `agikey --help`; JSON conversations output from isolated storage.
- Website inspected at 1440px desktop and 390px mobile: no mobile page overflow; provider selection updates code and diagram; language tabs and keyboard arrows work; clipboard and screenshot controls work; reduced-motion preference disables routing animation; no website console errors.
- Dashboard tested against an authenticated fixture server: key entry, provider discovery, streaming conversation, and visible provider-error handling. Its initial HTTP 401 responses before key entry are expected.
- Repository `git diff --check` and JavaScript syntax checks.

Screenshots from review are under `output/playwright/` (ignored from git/package): `website-desktop.png`, `website-mobile.png`, `website-full.png`.

## Live provider results

The opt-in HTTP smoke ran at 2026-09-16 08:30 UTC with temporary history/cache storage. Each attempted call requested the exact response `AGIKEY_OK`, with no tool use.

| Provider | Version | Non-streaming | Streaming |
| --- | --- | --- | --- |
| agy | 1.2.4 | Pass, 5.1 seconds | Pass, 5.3 seconds |
| Claude Code | 2.1.199 | Failed: credit balance too low | Same provider failure |
| Grok | 1.0.25 | Skipped: authentication needed | Skipped |
| Codex | 0.149.1 | Failed: configured `gpt-6-astra` requires newer CLI | Same version/model failure |

No provider account, billing setup, installed CLI version or global model configuration was changed. The initial inherited test suite used the normal discovery cache and performed live calls; that behavior was replaced with temporary directories and fixtures. All subsequent automated tests are isolated.

## Remaining release gates

1. Resolve Claude billing/authentication, Grok login, and Codex CLI/model compatibility, then rerun `npm run test:live`; or explicitly scope launch claims to agy. Do not describe all four providers as live verified.
2. Live-test structured output and reasoning flags if those are to be advertised as verified. Current coverage establishes flag wiring/parser behavior and documents provider dependence.
3. Review the prepared diff and check remote CI for the pushed version. Local matrix results are not remote CI evidence.
4. Completed: npm publication, registry metadata verification, and published CLI smoke check.
5. Completed: Vercel production deployment `dpl_ANabuEtFzpNHV9hcgf3qsHTcMJdv`; the production HTML matches the local source. Verified npm command/link, Open Graph and Twitter card tags, the 1200×630 PNG preview, and HTTP 200 asset responses on https://agikey.hyperplex.org.

## Intentional scope limits

Text only; no Responses API, tool-call protocol, image/audio input, batching or sampling/token-limit controls. Role conversion is text-based. Usage may be estimated. Structured output is passed to supported CLIs but not independently schema-validated. No multi-user isolation, public hosting of the gateway, independent security audit or native provider-session continuity is claimed.

A failed generation leaves the user turn in saved history; partial assistant output is not committed as success. Retrying the same text can duplicate it. Conversation locking is per server process; use one process per data directory. Provider settings and credentials remain governed by the installed CLIs.
