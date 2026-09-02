# Safari Fork Status

Last audited: 2026-09-02

## Objective

Keep `stellarjmr/read-frog` continuously synchronized with
`mengxi-ream/read-frog`, ship every feasible upstream feature in a Safari-only
Manifest V3 build, and distribute the persistent macOS Safari extension through
`stellarjmr/homebrew-tool` rather than temporary local loading.

## Current State

- Upstream merged through `02ad422c` (`fix(translate): serve remounted paragraphs
from an in-tab memory tier`). At this audit, `upstream/main` is an ancestor of
  fork `main` at `512b7ca1`. The deployed no-change sync path passed in run
  `33632190240`.
- The WXT build target is locked to Safari MV3 with Safari 18.0 as the minimum.
- Chrome, Edge, Firefox, offscreen, and side-panel build artifacts are excluded.
- Raw Safari WebExtension build and verification work locally.
- The generated unsigned macOS container has passed the real GitHub macOS/Xcode
  smoke workflow. Downloaded artifact evidence confirms a Universal
  `Read Frog.app`, the `com.zhimin.readfrog` / `.Extension` bundle hierarchy,
  the embedded Safari MV3 manifest, and valid ad-hoc deep signatures. Verified
  run: `33631487209` on commit `26fe3adb`.
- GitHub release automation covers raw WebExtension ZIPs plus the signed,
  notarized app and cask contract, but the stable macOS app/Homebrew release is
  not yet publishable without credentials. Changesets PR #1 has been refreshed
  for `@read-frog/extension@2.0.0` and contains every current upstream and
  Safari-distribution changeset. Its Safari build and full test checks passed in
  run `33632589348` after the repository's first-contributor approval.
- `stellarjmr/homebrew-tool` exists and is already tapped locally. It does not
  yet contain a `read-frog` cask; its verified-release polling workflow is
  deployed at `d509149`. Its no-release path passed again in run `33633131788`,
  and the first-cask/update detection is covered separately, so it safely skips
  publishing until signed and notarized assets exist.

## Intentional Safari Divergence

| Area                        | Upstream behavior                       | Safari fork behavior                                                  |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Build targets               | Chrome/Edge/Firefox                     | Safari MV3 only                                                       |
| Side panel                  | `sidePanel` API and entrypoint          | Removed because Safari has no compatible WebExtensions side-panel API |
| Background audio            | Offscreen document playback             | DOM audio controller in the invoking extension page                   |
| Google identity/config sync | `identity` API and Google Drive sync UI | Removed pending a Safari-compatible OAuth flow                        |
| Auth refresh                | Browser-specific identity events        | Safari cookie polling/alarms                                          |
| Minimum browser             | Multi-browser matrix                    | Safari 18.0+                                                          |

Any new divergence must be added here. Prefer an adapter or reduced Safari UI
over deleting upstream domain logic.

## Established Automation

- `.github/workflows/sync-upstream.yml`: scheduled/manual upstream merge,
  candidate branch, Safari policy/build/test/app-container gates, then
  fast-forward promotion to `main`; opens one actionable issue on conflict or
  validation failure.
- `scripts/verify-safari-policy.mjs`: fast source-level guard against restoring
  non-Safari targets before the full WXT build.
- `scripts/package-safari-app.mjs`: Xcode app-container generation, signed build,
  notarization, stapling, stable artifact naming, and checksum output.
- `.github/workflows/release.yml`: validates the certificate identity and calls
  `notarytool history` before Changesets can create a release tag.
- Homebrew cask metadata is emitted as a release asset. The tap polls releases
  and publishes the cask from its own repository token.

## Release Blocker

This machine has only Apple Command Line Tools, no full Xcode, and no usable
code-signing identity. The GitHub repositories currently have no Actions
secrets configured. Apple requires a containing macOS app, and stable
distribution outside the Mac App Store requires Developer ID signing and
notarization.

Configure these Actions secrets in `stellarjmr/read-frog` before merging the
release PR:

| Secret                       | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `MACOS_CERTIFICATE_P12`      | Base64-encoded Developer ID Application certificate and private key |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the PKCS#12 file                                       |
| `MACOS_SIGNING_IDENTITY`     | Full `Developer ID Application: ... (TEAMID)` identity              |
| `APPLE_TEAM_ID`              | Apple Developer team identifier                                     |
| `APPLE_NOTARY_KEY_ID`        | App Store Connect API key ID                                        |
| `APPLE_NOTARY_ISSUER_ID`     | App Store Connect issuer ID                                         |
| `APPLE_NOTARY_PRIVATE_KEY`   | Contents of the matching `AuthKey_*.p8` file                        |

## Next Verified Milestones

1. Add the seven signing/notary secrets and rerun the unsigned packaging smoke
   workflow after any credential-driven script adjustment.
2. Merge the open Changesets release PR; its preflight will refuse to create a
   tag if any release secret is missing.
3. Verify `codesign`, Gatekeeper assessment, notarization, and stapling on the
   downloaded release app.
4. Let the tap publish `Casks/read-frog.rb`, then verify from a clean state with
   `brew install --cask stellarjmr/tool/read-frog` and enable the extension in
   Safari Settings.
5. Only after that end-to-end check, mark Homebrew distribution ready here.
