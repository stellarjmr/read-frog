# AGENTS.md

## Repository Mission

- This repository is the long-lived, Safari-only fork of
  `mengxi-ream/read-frog`.
- `upstream/main` is the source of truth for product features and bug fixes.
  Preserve upstream browser-neutral behavior and port incompatible browser APIs
  to Safari instead of silently dropping features.
- The fork must only build Safari Manifest V3 artifacts. Do not restore Chrome,
  Edge, or Firefox build scripts, store workflows, manifest entries, or release
  assets.
- Read `STATUS.md` before changing code. Update it whenever sync state,
  intentional divergence, release readiness, or a blocker changes.

## Upstream Sync

- Expected remotes:
  - `origin`: `stellarjmr/read-frog`
  - `upstream`: `mengxi-ream/read-frog`
- Merge complete upstream `main` commits; do not cherry-pick only the easy
  features. During conflicts, take upstream product/domain logic first and then
  reapply the smallest Safari compatibility layer.
- Never resolve a sync by accepting upstream browser packaging wholesale or by
  deleting a newly added upstream feature. If Safari cannot implement an API,
  document the limitation and proposed adapter in `STATUS.md`.
- `.github/workflows/sync-upstream.yml` is the production sync path. A direct
  local sync must pass the same gates before it is pushed.
- Attribute fork-authored and automated merge commits to
  `stellarjmr <219479939+stellarjmr@users.noreply.github.com>` while preserving
  the original authorship of commits imported from upstream.
- Run `git fetch upstream main`, then inspect
  `git rev-list --left-right --count upstream/main...HEAD` and
  `git log --oneline HEAD..upstream/main` before claiming the fork is current.

## Required Validation

- Use Node.js and pnpm versions declared in `package.json`.
- Run `pnpm verify:safari-policy` before a build when changing fork policy,
  packaging, manifests, entrypoints, or workflows.
- Run `pnpm build` followed by `pnpm verify:safari` for every upstream sync and
  Safari compatibility change.
- Run `SKIP_FREE_API=true pnpm test` for local and CI validation.
- Run `pnpm lint` and `pnpm exec nx fmt:check` before pushing a sync or release
  change.
- On a Mac with full Xcode, run `pnpm package:macos:unsigned` when changing the
  app-container or Homebrew pipeline. Command Line Tools alone are insufficient.

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.

## Release and Homebrew Notes

- Stable distribution is a signed and notarized macOS app containing the Safari
  Web Extension. A raw WXT ZIP or ad-hoc-signed app is never a stable Homebrew
  release.
- `scripts/package-safari-app.mjs` owns app-container generation. Keep its bundle
  identifier stable (`com.zhimin.readfrog`) because changing it creates a new
  Safari extension identity and storage container.
- The release asset contract is
  `Read-Frog-<version>-macos.zip`, containing `Read Frog.app`. The tap token is
  `read-frog` in `stellarjmr/homebrew-tool`.
- Configure Apple release secrets with `pnpm configure:release-secrets`; never
  paste certificate passwords, PKCS#12 data, or `.p8` contents into issues,
  commits, logs, or AI conversations.
- Never print certificate, key, notary, Apple account, or token secret values.
- Do not merge the Changesets release PR while `STATUS.md` reports signing or
  notarization as blocked.
