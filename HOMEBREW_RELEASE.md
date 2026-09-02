# Homebrew Unsigned Safari App Release Runbook

Homebrew installs the containing `Read Frog.app`; it cannot permanently install
a raw WebExtension directory. The app contains the WXT Safari MV3 build and is
identified by the stable bundle ID `com.zhimin.readfrog`.

## Security Model

The fork owner has intentionally selected unsigned distribution because no
Apple Developer Program credentials are available. Xcode builds without a
Developer ID identity, then the packager applies an ad-hoc signature so macOS
can verify bundle integrity. The result is not associated with an Apple-verified
developer and is not notarized.

Consequences that must remain visible to users:

- Homebrew can download, checksum, and install the app, but it cannot make
  Gatekeeper trust an unidentified developer.
- macOS may require manual first-launch approval in System Settings > Privacy &
  Security.
- Safari ignores the extension until "Allow unsigned extensions" is enabled.
- Safari resets that setting whenever Safari quits, so it must be enabled again
  after every Safari restart.

Do not add an automatic quarantine removal step or describe this build as
signed in user-facing release text. A valid ad-hoc `codesign` verification is an
integrity check, not Developer ID trust.

## Artifact Contract

- Git tag: `v<package.json version>`
- App archive: `Read-Frog-<version>-macos-unsigned.zip`
- Archive root: `Read Frog.app`
- Cask metadata asset: `read-frog.rb`
- Tap: `stellarjmr/homebrew-tool`
- Cask token: `read-frog`
- Minimum macOS: Sequoia (Safari 18)

The cask URL and tap workflow must retain the `-unsigned` suffix so the trust
model cannot be mistaken for a Developer ID release.

## Local Smoke Build

Install full Xcode, select it with `xcode-select`, then run:

```bash
pnpm install --frozen-lockfile
pnpm package:macos:release
```

This invokes Apple's current `safari-web-extension-packager` and falls back to
its former `safari-web-extension-converter` name. The resulting app and embedded
extension receive ad-hoc signatures, and the ZIP checksum is emitted for the
cask renderer.

## Publishing

1. Run `Test Safari App Packaging` and require its signed-path diagnostic plus
   unsigned build to pass.
2. Merge the Changesets release PR.
3. Wait for `Release Safari Extension` to create the tag and release, run all
   source/build/tests, and upload the raw Safari ZIP, source ZIP, unsigned macOS
   ZIP, and `read-frog.rb`.
4. Dispatch the tap's `Update Read Frog Cask` workflow. It verifies the checksum,
   bundle layout, and ad-hoc signatures, audits the cask, performs a Homebrew
   install smoke test, and commits `Casks/read-frog.rb`.

For a repair of an existing tag, dispatch `Release Safari Extension` and enter
the tag. The rebuild overwrites only the generated release assets.

## End-to-End Verification

From a machine without a previous Read Frog installation:

```bash
brew update
brew install --cask stellarjmr/tool/read-frog
codesign --verify --deep --strict --verbose=2 "/Applications/Read Frog.app"
codesign --display --verbose=4 "/Applications/Read Frog.app" 2>&1 | grep "Signature=adhoc"
```

`spctl --assess` and `xcrun stapler validate` are expected to reject this build;
passing either check would mean the documented unsigned contract no longer
matches the artifact.

After installation:

1. Open Read Frog once. If macOS blocks it, open System Settings > Privacy &
   Security and choose Open Anyway for Read Frog.
2. In Safari > Settings > Advanced, enable "Show features for web developers".
3. In Safari > Settings > Developer, enable "Allow unsigned extensions".
4. Open Read Frog again, then enable it in Safari > Settings > Extensions and
   grant the desired website access.

Repeat step 3 after every Safari restart. Upgrades remain available with:

```bash
brew upgrade --cask stellarjmr/tool/read-frog
```

## Optional Future Developer ID Release

If Apple credentials become available later, `pnpm package:macos:signed` and
`pnpm configure:release-secrets` retain the signed/notarized implementation.
Switching the public artifact requires updating this runbook, `AGENTS.md`,
`STATUS.md`, the policy verifier, the release workflow, and the tap workflow in
one validated change.
