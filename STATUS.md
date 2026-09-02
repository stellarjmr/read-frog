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
- The generated unsigned macOS container has passed both the real GitHub
  macOS/Xcode smoke workflow and the stable release workflow. Downloaded
  artifact evidence confirms a Universal `Read Frog.app`, the
  `com.zhimin.readfrog` / `.Extension` bundle hierarchy, the embedded Safari
  MV3 manifest, and valid ad-hoc deep signatures. The smoke run was
  `33641727537`; the successful stable rebuild was `33649233832`.
- The owner selected transparent unsigned Homebrew distribution on 2026-09-02.
  Release automation publishes the ad-hoc-signed, unnotarized macOS app as
  `Read-Frog-<version>-macos-unsigned.zip`; it does not require or claim Apple
  Developer credentials. Changesets PR #1 merged as `b95fa09c` and published
  `@read-frog/extension@2.0.0` plus GitHub Release `v2.0.0`.
- Release `v2.0.0` contains the unsigned macOS archive, Safari archive, source
  archive, and generated cask. Independent download verification matched
  SHA-256 `e6824839badde5f1ca6dcc2351ab081e02e7c35e4b56092b1987ae06f9dabb5a`,
  confirmed `Signature=adhoc`, found no signing authority or notarization
  ticket, and confirmed the expected Gatekeeper rejection.
- `stellarjmr/homebrew-tool` publishes `Casks/read-frog.rb` at tap commit
  `0732888f`. Tap run `33650280373` passed strict audit and a clean install /
  uninstall test. A separate local install with
  `brew install --cask stellarjmr/tool/read-frog` succeeded and left version
  `2.0.0` at `/Applications/Read Frog.app`; both the app and embedded extension
  pass strict codesign integrity verification.
- Pull request #3 merged the unsigned release path at `f47c22dd`. A follow-up
  release fix at `c76307f4` makes optional analytics secrets genuinely optional
  and was used for the successful `v2.0.0` rebuild.
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

## Distribution Readiness

The unsigned Homebrew distribution path is ready and verified end to end. The
remaining first-run actions are intentionally manual security decisions: approve
Read Frog in macOS Privacy & Security if Gatekeeper blocks it, enable Safari's
unsigned-extension developer setting, open Read Frog once, and enable the
extension. Continue validating future upstream syncs and releases with the
established automation above.
