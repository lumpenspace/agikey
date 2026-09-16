# Contributing

Use Node.js 18+ (a maintained LTS is recommended). No npm install is required for the runtime or isolated tests.

1. Run `npm test` before changing behavior.
2. Add fixture coverage for adapter formats or request handling you change.
3. Keep ordinary tests independent of accounts, installed CLIs and user data. Use temporary `AGIKEY_HOME` directories and ephemeral ports.
4. Run `npm run release:check` to exercise the packaged CLI.
5. Preview website edits with `npm run site:preview`; inspect desktop/mobile layout, keyboard navigation, copy buttons and console errors.

Live checks are opt-in (`npm run test:live -- agy`), spend quota, and must report provider version, date, success/failure and skipped states. Do not label an adapter live-verified based only on fixtures or discovery status.

Do not commit credentials, local `.env` files, `.vercel` identifiers, provider conversations or discovery caches. Runtime additions must remain dependency-free unless the project intentionally revisits that constraint.
