#!/usr/bin/env bash
# Install the Fresh code-nav plugin.
# Non-destructive: creates directories and replaces the plugin symlink only.
#
#   bash fresh-plugin/install.sh
#   FRAME=/tmp/frame.json bash fresh-plugin/install.sh   # also render fixture
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
BUN="${BUN:-$HOME/.bun/bin/bun}"
FRESH_CONFIG="${FRESH_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/fresh}"
PLUGIN_DIR="$FRESH_CONFIG/plugins"

if [ ! -x "$BUN" ]; then
  echo "bun not found at $BUN (override with BUN=/path/to/bun)" >&2
  exit 1
fi

echo "==> bundle and symlink plugin"
BUNDLE="$REPO/out/fresh-plugin/code-nav.js"
if [ ! -f "$BUNDLE" ]; then
  (cd "$REPO" && "$BUN" run build:fresh)
fi
# Fresh loads .ts plugins; the bundle is plain JS, which is valid TS. Symlink it
# as .ts so the loader discovers it without trying to resolve the source imports.
mkdir -p "$PLUGIN_DIR"
ln -sfn "$BUNDLE" "$PLUGIN_DIR/code-nav.ts"
ls -l "$PLUGIN_DIR/code-nav.ts"

if [ -n "${FRAME:-}" ]; then
  echo "==> optional fixture frame"
  mkdir -p "$(dirname "$FRAME")"
  "$BUN" "$REPO/tui/render.ts" \
    --graph "$REPO/tui/fixture-graph.json" \
    --out "$FRAME"
  echo "Frame:     $FRAME"
fi

echo "Installed. In Fresh: Ctrl+P -> 'Code Nav: Open Graph (cbm|SCIP)'"
echo "Plugin:    $PLUGIN_DIR/code-nav.ts -> $BUNDLE"
echo "Jump bridge (separate terminal): bun run jump:bridge"
echo "Uninstall: remove $PLUGIN_DIR/code-nav.ts (no other files are touched)"
