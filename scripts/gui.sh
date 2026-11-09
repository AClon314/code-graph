#!/usr/bin/env bash
# Start the local GUI harness: build, install this extension into an isolated
# code-server profile, and run code-server on the fixture workspace.
#
#   bun run gui
#   HOST=0.0.0.0 PASSWORD=secret bun run gui   # remote, password auth
#
# Requires code-server on PATH. This is intentionally a development harness,
# not a packaging step.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

if ! command -v code-server >/dev/null 2>&1; then
  echo "error: code-server is not installed or not on PATH" >&2
  echo "       install it first; bun run gui has no test-web fallback" >&2
  exit 127
fi

BUN="${BUN:-$HOME/.bun/bin/bun}"
[ -x "$BUN" ] || BUN="$(command -v bun)"

CERT="$REPO/out/certs/pub.pem"
KEY="$REPO/out/certs/key.pem"
if ! "$BUN" run lazy_mkcert; then
  if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "warning: lazy_mkcert failed; using existing certificate in out/certs" >&2
  else
    echo "warning: lazy_mkcert failed and out/certs is incomplete; code-server will use its own TLS settings" >&2
  fi
fi

"$BUN" run build

NAME="$("$BUN" -e 'const p = JSON.parse(await Bun.file("package.json").text()); console.log(`${p.publisher}.${p.name}-${p.version}`)')"
EXT_DIR="${CODE_SERVER_EXTENSIONS_DIR:-$REPO/.code-server/extensions}"
DATA_DIR="${CODE_SERVER_DATA_DIR:-$REPO/.code-server/data}"
mkdir -p "$EXT_DIR" "$DATA_DIR"
ln -sfn "$REPO" "$EXT_DIR/$NAME"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
AUTH="${AUTH:-none}"

if [ "$AUTH" = "none" ] && [ "$HOST" != "127.0.0.1" ] && [ "$HOST" != "localhost" ]; then
  echo "warning: code-server is binding $HOST with --auth none" >&2
  echo "         set AUTH=password and PASSWORD=... for non-loopback access" >&2
fi

CERT_ARGS=()
if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  CERT_ARGS=(--cert "$CERT" --cert-key "$KEY")
else
  echo "warning: no generated certificate in out/certs; code-server will use its own TLS settings" >&2
fi

start_cbm() {
  if [ "${CBM_AUTOSTART:-1}" != "1" ]; then
    return
  fi

  local bin="${CBM_BIN:-}"
  if [ -z "$bin" ]; then
    bin="$(command -v codebase-memory-mcp 2>/dev/null || true)"
  fi
  if [ -z "$bin" ]; then
    echo "warning: codebase-memory-mcp not found; cbm will not be started" >&2
    echo "         install it with: bun i -g codebase-memory-mcp@0.12.1" >&2
    return
  fi

  local port="${CBM_PORT:-}"
  if [ -z "$port" ]; then
    port="$("$bin" config get ui_port 2>/dev/null | tail -n 1 | tr -d '[:space:]' || true)"
  fi
  port="${port:-9749}"

  if command -v curl >/dev/null 2>&1 &&
    curl -fsS --max-time 1 "http://127.0.0.1:${port}/api/ui-config" >/dev/null 2>&1; then
    echo "== cbm already running on :${port}"
    return
  fi

  echo "== starting cbm on :${port} (log: out/cbm.log)"
  mkdir -p "$REPO/out"
  ( sleep 2147483647 | "$bin" --ui=true --port="$port" >"$REPO/out/cbm.log" 2>&1 ) &

  if command -v curl >/dev/null 2>&1; then
    for _ in $(seq 1 30); do
      if curl -fsS --max-time 1 "http://127.0.0.1:${port}/api/ui-config" >/dev/null 2>&1; then
        echo "== cbm ready: http://127.0.0.1:${port}/"
        return
      fi
      sleep 0.2
    done
    echo "warning: cbm did not become healthy; see out/cbm.log" >&2
  fi
}

start_cbm

exec code-server \
  --bind-addr "$HOST:$PORT" \
  --auth "$AUTH" \
  "${CERT_ARGS[@]}" \
  --user-data-dir "$DATA_DIR" \
  --extensions-dir "$EXT_DIR" \
  --disable-telemetry \
  --disable-update-check \
  "$@" \
  "$REPO/fixtures/workspace"
