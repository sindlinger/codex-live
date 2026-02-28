#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$BASE_DIR/dist/tmux-watch-popup-toggle.js" "$@"
