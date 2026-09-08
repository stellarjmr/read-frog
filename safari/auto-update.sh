#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
label=com.github.stellarjmr.ReadFrogSafari.update
agent="$HOME/Library/LaunchAgents/$label.plist"
state_dir="$HOME/Library/Application Support/Read Frog Safari"
case "${1:-}" in
  enable)
    mkdir -p "$(dirname "$agent")" "$state_dir"
    python3 - "$agent" "$PWD/safari/update.sh" "$state_dir" "$label" <<'PY'
import os, plistlib, sys
agent, script, state, label = sys.argv[1:]
with open(agent, "wb") as f:
    plistlib.dump({
        "Label": label,
        "ProgramArguments": ["/bin/bash", script],
        "EnvironmentVariables": {"PATH": os.environ["PATH"]},
        "StartInterval": 86400,
        "StandardOutPath": state + "/update.log",
        "StandardErrorPath": state + "/update.log",
    }, f)
PY
    launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$agent"
    echo "Daily updates enabled. Log: $state_dir/update.log"
    ;;
  disable)
    launchctl bootout "gui/$(id -u)" "$agent" 2>/dev/null || true
    rm -f "$agent"
    echo 'Daily updates disabled.'
    ;;
  *)
    echo 'Usage: bash safari/auto-update.sh enable|disable' >&2
    exit 1
    ;;
esac
