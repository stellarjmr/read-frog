# Homebrew Safari App Release Runbook

Homebrew installs the containing `Read Frog.app`; it cannot permanently install
a raw WebExtension directory. The app contains the WXT Safari MV3 build and is
identified by the stable bundle ID `com.zhimin.readfrog`.

## Artifact Contract

- Git tag: `v<package.json version>`
- Stable app archive: `Read-Frog-<version>-macos.zip`
- Archive root: `Read Frog.app`
- Cask metadata asset: `read-frog.rb`
- Tap: `stellarjmr/homebrew-tool`
- Cask token: `read-frog`
- Minimum macOS: Sequoia (Safari 18)

Unsigned archives end in `-macos-unsigned.zip`. They are smoke-test artifacts
only and must not be attached to a stable GitHub release or referenced by the
tap.

## Local Smoke Build

Install full Xcode, select it with `xcode-select`, then run:

```bash
pnpm install --frozen-lockfile
pnpm package:macos:unsigned
```

This invokes Apple's current `safari-web-extension-packager` and falls back to
its former `safari-web-extension-converter` name. It creates an ad-hoc-signed
app only to verify project generation and compilation.

## Stable Release Credentials

Add the Actions secrets listed in `STATUS.md`. Export the Developer ID
Application certificate together with its private key as a password-protected
PKCS#12 file, then base64-encode the file for `MACOS_CERTIFICATE_P12`. Store the
full identity string in `MACOS_SIGNING_IDENTITY`.

Use an App Store Connect API key for notarization. Store the three key fields as
`APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID`, and
`APPLE_NOTARY_PRIVATE_KEY`.

The workflow imports credentials into an ephemeral keychain, builds both app
and extension with hardened runtime, submits the ZIP to `notarytool`, staples
the accepted ticket, verifies it with `stapler`, and requires Gatekeeper's
`spctl` assessment to pass.

## Publishing

1. Confirm `STATUS.md` no longer reports signing/notary secrets as blocked.
2. Run `Test Safari App Packaging` and require a passing result.
3. Merge the Changesets release PR.
4. Wait for `Release Safari Extension` to upload all four asset classes: raw
   Safari ZIP, source ZIP, signed/notarized macOS ZIP, and `read-frog.rb`.
5. The tap's scheduled `Update Read Frog Cask` workflow downloads the cask
   metadata asset, audits it, and commits it with the tap repository's own
   `GITHUB_TOKEN`.

For a repair of an existing tag, dispatch `Release Safari Extension` and enter
the tag. This rebuild path still requires every signing and notarization gate.

## End-to-End Verification

From a machine without a previous Read Frog app installation:

```bash
brew update
brew install --cask stellarjmr/tool/read-frog
codesign --verify --deep --strict --verbose=2 "/Applications/Read Frog.app"
spctl --assess --type execute --verbose=2 "/Applications/Read Frog.app"
xcrun stapler validate "/Applications/Read Frog.app"
```

Open the app once, enable Read Frog under Safari Settings > Extensions, grant
website access, and verify translation on a normal page. Then verify upgrades:

```bash
brew upgrade --cask stellarjmr/tool/read-frog
```
