#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
state_dir="$HOME/Library/Application Support/Read Frog Safari"
mkdir -p "$state_dir"
# A launchd run and a manual run must not build/install over each other.
if ! mkdir "$state_dir/update.lock" 2>/dev/null; then
  echo 'Another update is running. If a previous update was interrupted, remove the update.lock directory.' >&2
  exit 1
fi
trap 'rmdir "$state_dir/update.lock"' EXIT
if [[ "$(git branch --show-current)" != main || -n "$(git status --porcelain)" ]]; then
  echo 'Update needs a clean main checkout. Commit or move local edits first; no changes were discarded.' >&2
  exit 1
fi
git fetch origin main
git merge --ff-only origin/main
source_sha="$(git rev-parse HEAD)"
if [[ "$source_sha" != "$(git rev-parse origin/main)" ]]; then
  echo 'Local main contains unpublished commits. Push and validate them before updating the installed app.' >&2
  exit 1
fi
if python3 - "$HOME/Applications/Read Frog Safari.app/Contents/Resources/safari-build.json" "$source_sha" <<'PY'
import json, pathlib, sys
metadata = pathlib.Path(sys.argv[1])
try:
    installed = json.loads(metadata.read_text())
    sys.exit(0 if installed["sourceSha"] == sys.argv[2] and not installed["dirty"] else 1)
except (OSError, ValueError, KeyError):
    sys.exit(1)
PY
then
  echo "Already installed: $source_sha"
  exit 0
fi
if [[ -z "${SAFARI_SIGN_IDENTITY:-}" && -f "$state_dir/signing-identity" ]]; then
  export SAFARI_SIGN_IDENTITY="$(cat "$state_dir/signing-identity")"
fi
pnpm install --frozen-lockfile
pnpm safari:package
bash safari/install.sh --no-open
