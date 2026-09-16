# Release procedure

Package: `agikey`; executable aliases: `agikey`, `agiary`; prepared version: `1.0.1`.

## Before publication

1. Run `npm run release:check`. It runs isolated tests, packs the allowlisted runtime files, rejects unexpected archive entries, installs into a temporary prefix, and checks both commands.
2. Run `npm run test:live`. Resolve provider environment failures or explicitly scope the release to the providers actually verified. Run additional live schema/reasoning checks before claiming those options are verified.
3. Review `docs/LAUNCH.md`, README compatibility limits and the website copy together. Discovery and fixtures alone do not establish provider functionality.
4. Inspect `npm pack --dry-run` for accidental credentials or local data. Confirm the package name/owner and homepage/repository visibility.
5. Confirm GitHub CI passes on all supported Node versions. Local verification does not establish the remote matrix result.
6. Check npm ownership and publish credentials. Neither a successful pack nor a configured workflow establishes authorization to publish.

## First publication from your machine

The source and version tag can be on GitHub without the package being published to npm. To publish the prepared 1.0.1 package:

```sh
cd agikey
npm login
npm whoami
npm publish --access public
npm view agikey version
npx --yes agikey@1.0.1 --help
```

Complete npm's browser authentication and 2FA prompts. `prepublishOnly` runs the isolated suite and package verification before publication. The unscoped package name must be available to your account. No npm login, token changes, or registry publication are performed by pushing the Git tag.

Official reference: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/

## Publish (explicit release action)

Use the single GitHub **release published** trigger with a tag matching the manifest (`v1.0.1`). The workflow validates the tag, runs the release check and publishes with provenance using `NPM_TOKEN`. Configure the token in repository secrets first; do not put it in source. Avoid publishing by both tag push and release event.

Alternatively, after the checks, run `npm publish --access public` locally using the correct npm account. This publishes publicly and is intentionally not performed by `release:check`.

After publishing, verify:

```sh
npm view agikey version dist.integrity bin
npx --yes agikey@1.0.1 --help
```

Update the README and site's publication status, and change the primary installation command to `npm install -g agikey` only after the registry confirms publication.

## Website

`website/` is a static site with no build dependencies. Run `npm run site:preview` for review. Deploy that directory using the existing Vercel project only when a deployment is requested. The website and gateway are separate: deploying the site does not deploy local provider processes.

Verify desktop and mobile, links, provider routing controls, code tabs, copy buttons, screenshot selectors, reduced motion, and console errors. After deployment, verify the production URL and metadata. Keep the local preview and production status distinct.
