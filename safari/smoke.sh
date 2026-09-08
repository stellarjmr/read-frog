#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  for xcode_app in /Applications/Xcode.app /Applications/Xcode-beta.app; do
    if [[ -d "$xcode_app" ]]; then
      export DEVELOPER_DIR="$xcode_app/Contents/Developer"
      break
    fi
  done
fi
node safari/verify.mjs
temporary="$(mktemp -d "${TMPDIR:-/tmp}/readfrog-safari-smoke.XXXXXX")"
output="$PWD/.output/safari-qa"
mkdir -p "$output"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$temporary"
}
trap cleanup EXIT
python3 safari/smoke-server.py "$temporary/port" > "$output/server.log" 2>&1 &
server_pid=$!
for attempt in {1..300}; do
  [[ -f "$temporary/port" ]] && break
  kill -0 "$server_pid"
  sleep 0.1
done
if [[ ! -f "$temporary/port" ]]; then
  cat "$output/server.log" >&2
  echo 'Loopback fixture did not become ready within 30 seconds.' >&2
  exit 1
fi
origin="http://127.0.0.1:$(cat "$temporary/port")"
xcrun swiftc -target "$(uname -m)-apple-macos15.4" -parse-as-library \
  safari/smoke.swift -o "$temporary/smoke"
if ! python3 - "$temporary/smoke" "$PWD/.output/safari-mv3" "$origin" "$output" > "$output/runtime.log" 2>&1 <<'PY'
import subprocess, sys
try:
    sys.exit(subprocess.run(sys.argv[1:], timeout=90).returncode)
except subprocess.TimeoutExpired:
    raise SystemExit("WebKit integration test timed out after 90 seconds")
PY
then
  cat "$output/runtime.log" >&2
  exit 1
fi
cat "$output/runtime.log"
