# Source Code Review - Build Instructions

## Build Environment

- **Node.js**: ^26.7.0
- **pnpm**: 11.22.0 (pinned by the `packageManager` field in `package.json`)
- **Target**: Safari 18 or later only

## Build Steps

```bash
# 1. Install pnpm if it is not already available
npx get-pnpm

# 2. Install dependencies using the version pinned in package.json
pnpm install --frozen-lockfile

# 3. Build and verify the Safari extension
pnpm zip
pnpm verify:safari
```

## Environment Variables

No environment variable is required for a reproducible local Safari build. PostHog variables are optional and are used only when producing an analytics-enabled release.

## Build Output

After a successful build, the packaged extension will be at:

```
.output/*-safari.zip
```
