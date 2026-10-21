#!/usr/bin/env bash
# Install the Fresh code-nav plugin and (optionally) generate a fixture frame.
# Non-destructive: creates directories and replaces the plugin symlink only.
#
#   bash fresh-plugin/install.sh
#   FORCE=1 bash fresh-plugin/install.sh   # re-render tui/frame.json
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
BUN="${BUN:-$HOME/.bun/bin/bun}"
FRESH_CONFIG="${FRESH_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/fresh}"
PLUGIN_DIR="$FRESH_CONFIG/plugins"
FRAME="${FRAME:-$REPO/tui/frame.json}"

if [ ! -x "$BUN" ]; then
  echo "bun not found at $BUN (override with BUN=/path/to/bun)" >&2
  exit 1
fi

echo "==> 1/2 symlink plugin"
mkdir -p "$PLUGIN_DIR"
ln -sfn "$HERE/code-nav.ts" "$PLUGIN_DIR/code-nav.ts"
ls -l "$PLUGIN_DIR/code-nav.ts"

echo "==> 2/2 frame"
mkdir -p "$(dirname "$FRAME")"
if [ "${FORCE:-0}" = "1" ] || [ ! -f "$FRAME" ]; then
  "$BUN" "$REPO/tui/render.ts" \
    --graph "$REPO/tui/fixture-graph.json" \
    --out "$FRAME"
else
  echo "keeping existing frame: $FRAME (FORCE=1 to re-render the fixture)"
fi

echo
if [ "$FRAME" != "$REPO/tui/frame.json" ]; then
  echo "note: plugin default frame is $REPO/tui/frame.json"
  echo "      set CODE_NAV_FRAME=$FRAME (or edit FRAME_PATH in code-nav.ts)"
fi
echo "Installed. In Fresh: Ctrl+P -> 'Code Nav: Open Graph'"
echo "Frame:     $FRAME"
echo "Plugin:    $PLUGIN_DIR/code-nav.ts -> $HERE/code-nav.ts"
echo "Jump bridge (separate terminal): bun run jump:bridge"
echo "Uninstall: remove $PLUGIN_DIR/code-nav.ts (no other files are touched)"
