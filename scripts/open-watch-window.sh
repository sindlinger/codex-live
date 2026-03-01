#!/usr/bin/env bash
set -euo pipefail

SESSION_ID="${1:-current}"
LAUNCHER="${2:-powershell}"
OWNER_PID="${3:-0}"
OWNER_TTY="${4:-(unknown)}"
OWNER_CMD="${5:-codex-live-open}"

BASE_DIR="${HOME}/codex-live"
NODE_BIN="$(command -v node)"
WATCH_JS="${BASE_DIR}/dist/codex-live-watch.js"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "[open-watch-window] node não encontrado no PATH" >&2
  exit 2
fi
if [[ ! -f "${WATCH_JS}" ]]; then
  echo "[open-watch-window] watch script não encontrado: ${WATCH_JS}" >&2
  exit 2
fi

cd "${BASE_DIR}"
export CODEX_WATCH_WINDOW=1
export CODEX_WATCH_LAUNCHER="${LAUNCHER}"
export CODEX_WATCH_OPEN_PID="${OWNER_PID}"
export CODEX_WATCH_OPEN_TTY="${OWNER_TTY}"
export CODEX_WATCH_OWNER_CMD="${OWNER_CMD}"

exec "${NODE_BIN}" "${WATCH_JS}" "${SESSION_ID}"
