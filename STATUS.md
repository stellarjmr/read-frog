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
  the local fork history. The deployed no-change sync path passed in run
  `33632190240`.
- The WXT build target is locked to Safari MV3 with Safari 18.0 as the minimum.
- Chrome, Edge, Firefox, offscreen, and side-panel build artifacts are excluded.
- Raw Safari WebExtension build and verification work locally.
- The generated unsigned macOS container has passed the real GitHub macOS/Xcode
  smoke workflow. Downloaded artifact evidence confirms a Universal
  `Read Frog.app`, the `com.zhimin.readfrog` / `.Extension` bundle hierarchy,
  the embedded Safari MV3 manifest, and valid ad-hoc deep signatures. Verified
  run: `33641727537` on commit `d63730b7`. The same run also exercised an
  ephemeral signing identity, hardened runtime, exact certificate cleanup, and
  the unsigned diagnostic build without an interactive keychain prompt.
- The owner selected transparent unsigned Homebrew distribution on 2026-09-02.
  Release automation publishes the ad-hoc-signed, unnotarized macOS app as
  `Read-Frog-<version>-macos-unsigned.zip`; it does not require or claim Apple
  Developer credentials. Changesets PR #1 targets
  `@read-frog/extension@2.0.0` and contains every current upstream and
  Safari-distribution changeset.
- `stellarjmr/homebrew-tool` exists and is already tapped locally. It does not
  yet contain a `read-frog` cask. Its release polling workflow safely skips
  publishing until both the unsigned app archive and generated cask metadata
  exist on a stable release.
- Pull request #2 merged at `d63730b7` after its full test/build and macOS app
  packaging checks passed in runs `33642339245` and `33642339171`.
- Every commit reachable from the active fork-only `main` and
  `feat/safari-only` histories, plus every Read Frog tap commit, uses
  `stellarjmr <219479939+stellarjmr@users.noreply.github.com>` as both author
  and committer. Upstream-owned history retains its original authors. Sync,
  Changesets, and tap automation are configured to use the same identity for
  future commits and tags; GitHub-generated workflow events remain attributed
  to the GitHub Actions system actor.

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
- `scripts/package-safari-app.mjs`: Xcode app-container generation, ad-hoc and
  optional Developer ID signing modes, stable artifact naming, and checksum
  output.
- `.github/workflows/release.yml`: Changesets release creation followed by a
  full macOS build/test and unsigned app/cask asset upload.
- Homebrew cask metadata is emitted as a release asset. The tap polls releases
  and publishes the cask from its own repository token.

## Unsigned Distribution Constraints

- The archive is ad-hoc signed only. It has no Developer ID identity or Apple
  notarization ticket, and Gatekeeper is expected not to trust it automatically.
- Homebrew installs and checksum-verifies the app but does not bypass Gatekeeper.
  The user may need System Settings > Privacy & Security > Open Anyway on first
  launch.
- Safari 17 and later require Safari > Settings > Developer > Allow unsigned
  extensions. Safari resets this setting whenever it quits.
- The cask and release notes must disclose these limitations and must never
  describe the artifact as signed, notarized, or Apple-trusted.

GitHub CLI authentication and Git HTTPS credential integration are active for
`stellarjmr`. No Apple secret is required for the selected distribution mode.

## Next Verified Milestones

1. Pass source policy, cask contract, full tests, and the real Xcode unsigned
   packaging workflow.
2. Merge the open Changesets release PR and verify the unsigned release assets.
3. Let the tap publish `Casks/read-frog.rb`, then verify from a clean state with
   `brew install --cask stellarjmr/tool/read-frog` and enable the extension in
   Safari's unsigned-extension developer setting.
4. Only after that end-to-end check, mark Homebrew distribution ready here.
