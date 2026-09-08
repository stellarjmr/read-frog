#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Darwin ]]; then
  echo "Safari app packaging requires macOS and full Xcode." >&2
  exit 1
fi
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  for xcode_app in /Applications/Xcode.app /Applications/Xcode-beta.app; do
    if [[ -d "$xcode_app" ]]; then
      export DEVELOPER_DIR="$xcode_app/Contents/Developer"
      break
    fi
  done
fi
xcodebuild -version
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  packager=safari-web-extension-packager
else
  packager=safari-web-extension-converter
fi

if [[ "${1:-}" != --skip-web-build ]]; then
  pnpm build:safari
fi
node safari/verify.mjs
app_name="Read Frog Safari"
output="$PWD/.output/safari-macos"
project="$output/$app_name/$app_name.xcodeproj"
# Keep signed bundles outside iCloud/File Provider managed checkouts, which can
# reattach Finder metadata after signing and invalidate the signature.
checkout_id="$(printf '%s' "$PWD" | shasum -a 256 | cut -c 1-12)"
derived_data="${SAFARI_DERIVED_DATA:-$HOME/Library/Caches/ReadFrogSafari/$checkout_id}"
version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
build_number="${SAFARI_BUILD_NUMBER:-}"
if [[ -z "$build_number" ]]; then
  build_number="$(python3 - "$HOME/Applications/$app_name.app/Contents/Info.plist" <<'PY'
import pathlib, plistlib, sys
installed = pathlib.Path(sys.argv[1])
previous = plistlib.loads(installed.read_bytes()).get("CFBundleVersion", "0") if installed.exists() else "0"
print(int(previous) + 1 if str(previous).isdigit() else 1)
PY
)"
fi
[[ "$build_number" =~ ^[0-9]+$ ]] || { echo 'SAFARI_BUILD_NUMBER must be an integer.' >&2; exit 1; }
xcrun "$packager" .output/safari-mv3 \
  --project-location "$output" --app-name "$app_name" \
  --bundle-identifier com.github.stellarjmr.ReadFrogSafari \
  --macos-only --swift --copy-resources --no-open --no-prompt --force

# Some Xcode packager versions derive the app ID from its display name even
# when --bundle-identifier was supplied, leaving the extension ID mismatched.
python3 - "$project/project.pbxproj" <<'PY'
import pathlib, re, sys
project = pathlib.Path(sys.argv[1])
def bundle_id(match):
    suffix = ".Extension" if match[1].strip('"').endswith(".Extension") else ""
    return "PRODUCT_BUNDLE_IDENTIFIER = com.github.stellarjmr.ReadFrogSafari" + suffix + ";"
content, count = re.subn(r"PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);", bundle_id, project.read_text())
if count != 4:
    raise SystemExit(f"Unexpected Xcode project: expected four bundle IDs, found {count}")
project.write_text(content)
PY

if ! xcodebuild -project "$project" -scheme "$app_name" \
  -configuration Release -derivedDataPath "$derived_data" \
  -destination 'generic/platform=macOS' \
  CODE_SIGNING_ALLOWED=NO MACOSX_DEPLOYMENT_TARGET=14.0 \
  ARCHS='arm64 x86_64' ONLY_ACTIVE_ARCH=NO \
  MARKETING_VERSION="$version" CURRENT_PROJECT_VERSION="$build_number" \
  build > "$output/build.log" 2>&1; then
  tail -80 "$output/build.log" >&2
  exit 1
fi

app="$derived_data/Build/Products/Release/$app_name.app"
extension="$app/Contents/PlugIns/$app_name Extension.appex"
python3 - "$app/Contents/Resources/safari-build.json" <<'PY'
import json, pathlib, subprocess, sys
def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()
pathlib.Path(sys.argv[1]).write_text(json.dumps({
    "sourceSha": git("rev-parse", "HEAD"),
    "dirty": bool(git("status", "--porcelain")),
}) + "\n")
PY
# Finder/iCloud can attach metadata inside a Documents checkout. Remove only
# the two attributes codesign rejects, and only from our generated bundle.
xattr -dr com.apple.FinderInfo "$app" 2>/dev/null || true
xattr -dr com.apple.ResourceFork "$app" 2>/dev/null || true
# The CI download uses an ad-hoc signature. Local builds can use an Apple
# Development or Developer ID certificate already installed in the keychain.
identity="${SAFARI_SIGN_IDENTITY:--}"
cat > "$output/app.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/></dict></plist>
PLIST
cat > "$output/extension.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.network.client</key><true/></dict></plist>
PLIST
codesign --force --sign "$identity" --timestamp=none --entitlements "$output/extension.entitlements" "$extension"
codesign --force --sign "$identity" --timestamp=none --entitlements "$output/app.entitlements" "$app"
codesign --verify --deep --strict "$app"
node safari/verify.mjs "$extension/Contents/Resources"
for binary in "$app/Contents/MacOS/$app_name" "$extension/Contents/MacOS/$app_name Extension"; do
  architectures="$(lipo -archs "$binary")"
  for architecture in arm64 x86_64; do
    case " $architectures " in
      *" $architecture "*) ;;
      *) echo "Missing native architecture $architecture in $binary" >&2; exit 1 ;;
    esac
  done
done

artifacts="$PWD/.output/safari-artifacts"
mkdir -p "$artifacts"
ditto -c -k --sequesterRsrc --keepParent "$app" "$artifacts/Read-Frog-Safari-macOS.zip"
ditto -c -k --sequesterRsrc --keepParent "$output/$app_name" "$artifacts/Read-Frog-Safari-Xcode.zip"
(
  cd "$artifacts"
  shasum -a 256 Read-Frog-Safari-macOS.zip Read-Frog-Safari-Xcode.zip > SHA256SUMS
)
printf '%s\n' "$app" > "$output/app-path"
echo "Safari app: $app"
echo "Downloads: $artifacts"
