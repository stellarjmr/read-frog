# Upstream Synchronization Runbook

This fork follows `mengxi-ream/read-frog:main` while keeping one distribution
target: Safari Manifest V3. The automated workflow is
`.github/workflows/sync-upstream.yml`.

## Normal Flow

1. The workflow fetches upstream `main` every day (or by manual dispatch).
2. If new commits exist, it creates a merge commit on
   `automation/upstream-sync`.
3. It runs formatting, lint/type checks, the Safari source policy, the WXT
   build and generated-manifest checks, the complete test suite with live free
   APIs skipped, and an unsigned Xcode app-container smoke build.
4. Only a fully passing candidate is fast-forwarded to fork `main`.
5. A successful promotion dispatches the Changesets workflow. A conflict or
   failed gate updates one `upstream-sync` issue with the candidate and run.

The candidate branch is intentionally inspectable. It must never be treated as
a release branch.

## Manual Recovery

Start with a clean working tree:

```bash
git fetch origin main
git fetch upstream main
git switch main
git merge --ff-only origin/main
git switch -C fix/upstream-safari-port
git merge upstream/main
```

For each conflict:

- retain upstream translation, UI, data model, and provider behavior;
- reapply Safari manifest/entrypoint/API adapters from the fork;
- do not restore Chrome, Edge, Firefox, `offscreen`, or `sidePanel` artifacts;
- do not delete a new feature merely because its first implementation uses an
  unsupported browser API;
- record a genuine Safari limitation in `STATUS.md`.

Run the same gates as automation:

```bash
pnpm install --frozen-lockfile
pnpm exec nx fmt:check
pnpm lint
pnpm verify:safari-policy
pnpm build
pnpm verify:safari
SKIP_FREE_API=true pnpm test
pnpm package:macos:unsigned
```

The final command needs full Xcode. If the local machine only has Command Line
Tools, push the recovery branch and use the `Test Safari App Packaging`
workflow before merging.

## Auditing Currency

These commands are the authoritative currency check:

```bash
git fetch upstream main
git rev-list --left-right --count upstream/main...HEAD
git log --oneline HEAD..upstream/main
git merge-base --is-ancestor upstream/main HEAD
```

A zero left count and a successful ancestor check prove that all upstream main
commits are present. They do not prove Safari compatibility; the build, tests,
policy, manifest, and app-container gates provide that evidence.
