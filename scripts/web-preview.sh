#!/usr/bin/env bash
# Production-like standalone web preview. Starts cbm, builds the browser bundle,
# then serves it through vite preview.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
source "$REPO/scripts/cbm-service.sh"
start_cbm

BUN="${BUN:-$HOME/.bun/bin/bun}"
[ -x "$BUN" ] || BUN="$(command -v bun)"
"$BUN" run build:web

HOST="${WEB_HOST:-0.0.0.0}"
PORT="${WEB_PORT:-5173}"
exec vite preview --mode web --host "$HOST" --port "$PORT" "$@"
