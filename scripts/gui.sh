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

exec code-server \
  --bind-addr "$HOST:$PORT" \
  --auth "$AUTH" \
  --user-data-dir "$DATA_DIR" \
  --extensions-dir "$EXT_DIR" \
  --disable-telemetry \
  --disable-update-check \
  "$@" \
  "$REPO/fixtures/workspace"
