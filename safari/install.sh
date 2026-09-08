#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app_name="Read Frog Safari"
[[ -f .output/safari-macos/app-path ]] || { echo 'Run pnpm safari:package first.' >&2; exit 1; }
source_app="$(cat .output/safari-macos/app-path)"
install_dir="$HOME/Applications"
state_dir="$HOME/Library/Application Support/$app_name"
destination="$install_dir/$app_name.app"
[[ -d "$source_app" ]] || { echo 'Run pnpm safari:package first.' >&2; exit 1; }
codesign --verify --deep --strict "$source_app"
node safari/verify.mjs "$source_app/Contents/PlugIns/$app_name Extension.appex/Contents/Resources"
mkdir -p "$install_dir" "$state_dir"
stage="$(mktemp -d "$install_dir/.read-frog-install.XXXXXX")"
cleanup() {
  if [[ -d "$stage/previous.app" && ! -d "$destination" ]]; then
    mv "$stage/previous.app" "$destination"
  fi
  rm -rf "$stage"
}
trap cleanup EXIT
ditto "$source_app" "$stage/$app_name.app"
codesign --verify --deep --strict "$stage/$app_name.app"
if [[ -d "$destination" ]]; then
  mv "$destination" "$stage/previous.app"
fi
mv "$stage/$app_name.app" "$destination"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$destination"
pluginkit -a "$destination/Contents/PlugIns/$app_name Extension.appex"
python3 - "$destination/Contents/Resources/safari-build.json" > "$state_dir/installed-commit" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["sourceSha"])
PY
if [[ -n "${SAFARI_SIGN_IDENTITY:-}" ]]; then
  printf '%s\n' "$SAFARI_SIGN_IDENTITY" > "$state_dir/signing-identity"
fi
echo "Installed: $destination"
echo 'Enable Read Frog in Safari Settings > Extensions and allow access to websites.'
echo 'After an update, reopen Safari or reload your pages to use the new extension.'
if [[ "${1:-}" != --no-open ]]; then
  open "$destination"
fi
