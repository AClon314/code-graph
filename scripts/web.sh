#!/usr/bin/env bash
# Start the standalone web GUI. cbm is started when available; VITE_SOURCE=cbm
# selects live data (the default is the computed offline sample).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
source "$REPO/scripts/cbm-service.sh"
start_cbm

HOST="${WEB_HOST:-127.0.0.1}"
PORT="${WEB_PORT:-5173}"
exec vite --host "$HOST" --port "$PORT" "$@"
