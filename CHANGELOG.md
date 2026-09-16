# Changelog

## 1.0.1 — 2026-09-16

Launch preparation for the local gateway for agy, Claude Code, Grok and Codex, with Chat Completions, legacy text completions, SSE, saved text conversations and a local dashboard.

Launch preparation:

- Isolated, account-free HTTP and adapter tests; separate opt-in live smoke command.
- Authenticated management routes, strict text request validation, bounded request size, same-origin browser access, loopback Host checks and keyed non-loopback binding.
- Shared provider lifecycle handling: deadlines, cancellation, failure propagation and no success on partial-output process failures.
- Corrected Claude streaming flags/events, Grok Messages-format events, Codex reasoning forwarding and unsupported structured-output handling.
- Private conversation files, atomic updates, validated IDs and duplicate-create protection.
- Corrected discovery claims and provider defaults; package installation smoke checks; one release publish trigger.
- Rebuilt responsive website with interactive routing, SDK examples, accessible tabs and honest pre-release status.

See `docs/LAUNCH.md` for verified results and remaining release gates.

Website refinement: subscription-focused headline, four-connector API overview, a streamlined section order without the features section, no section eyebrows, and the dashboard's charcoal/amber palette.
