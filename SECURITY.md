# Security

Agikey is intended for a single trusted user on a local machine. It launches installed CLI programs with the server process's environment and working directory. The underlying providers receive prompts. Local history is stored unencrypted under `AGIKEY_HOME` (default `~/.agikey`).

Keep the loopback default. Set `AGIKEY_API_KEY` when other local users or trusted network clients can reach the service. A key is mandatory for non-loopback binding, but does not provide tenant isolation or HTTPS. Do not expose this service directly to the public internet.

Conversation IDs are strictly validated. Conversation files use owner-only permissions and atomic replacement. API keys entered in the dashboard stay in page memory. Diagnostic API routes share completion-route authentication. Browser origins are restricted to the same origin; loopback Host headers are allowlisted.

Report security issues through the repository's private vulnerability reporting feature if enabled. Do not post credentials or private conversations in a public issue. An independent security audit has not been performed.
