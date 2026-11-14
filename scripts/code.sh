#!/usr/bin/env bash
# Start the local code-server harness: build, install this extension into an
# isolated profile, and run code-server on the caller's cwd.
#
#   bun run code
#   WORKSPACE=/path/to/repo bun run code
#   HOST=0.0.0.0 PASSWORD=secret bun run code   # remote, password auth
#
# code-server otherwise redirects "/" to the last folder stored in coder.json;
# --ignore-last-opened keeps the explicit WORKSPACE (current cwd by default)
# authoritative across restarts.
#
# Requires code-server on PATH. This is intentionally a development harness,
# not a packaging step.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_CWD="$(pwd)"
WORKSPACE="${WORKSPACE:-$CALLER_CWD}"
case "$WORKSPACE" in
  /*) ;;
  *) WORKSPACE="$CALLER_CWD/$WORKSPACE" ;;
esac
cd "$REPO"

if ! command -v code-server >/dev/null 2>&1; then
  echo "error: code-server is not installed or not on PATH" >&2
  echo "       install it first; bun run code has no test-web fallback" >&2
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

needs_build() {
  [ "${CODE_GRAPH_FORCE_BUILD:-0}" = "1" ] && return 0
  [ "${CODE_GRAPH_SKIP_BUILD:-0}" = "1" ] && return 1
  local output
  for output in out/dist/webview/assets/webview.js out/dist/extension.cjs; do
    [ -f "$output" ] || return 0
  done
  local newer
  newer="$(find src index.html package.json tsconfig.json vite.config.ts \
    -type f -newer out/dist/extension.cjs -print -quit 2>/dev/null || true)"
  [ -n "$newer" ]
}

if needs_build; then
  "$BUN" run build:webview
  "$BUN" run build:extension
else
  echo "== build up to date (use CODE_GRAPH_FORCE_BUILD=1 to rebuild)"
fi

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

source "$REPO/scripts/cbm-service.sh"
start_cbm

exec code-server \
  --bind-addr "$HOST:$PORT" \
  --auth "$AUTH" \
  "${CERT_ARGS[@]}" \
  --user-data-dir "$DATA_DIR" \
  --extensions-dir "$EXT_DIR" \
  --disable-telemetry \
  --disable-update-check \
  --ignore-last-opened \
  "$@" \
  "$WORKSPACE"
