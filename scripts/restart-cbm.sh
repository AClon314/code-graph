#!/usr/bin/env bash
# Restart the local cbm HTTP listener used by `bun run web`.
# Only the process owning the configured UI port is stopped; the shared
# indexing daemon and unrelated cbm processes are left alone.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CBM_PORT:-9749}"

if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    for _ in $(seq 1 30); do
      lsof -ti "tcp:${PORT}" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.1
    done
  fi
fi

export CBM_PORT="$PORT"
export CBM_AUTOSTART=1
# shellcheck source=scripts/cbm-service.sh
source "$REPO/scripts/cbm-service.sh"
start_cbm
