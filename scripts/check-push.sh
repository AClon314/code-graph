#!/usr/bin/env sh
# Push gate: fast checks + browser e2e. Fresh is optional because a machine
# without the editor can still run the web and VS Code suites.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
bun run check:commit
bun run test:web
if command -v "${FRESH_BIN:-fresh}" >/dev/null 2>&1; then
  bun run test:fresh
else
  echo "warning: fresh not found; skipping tests/fresh"
fi
if command -v code-server >/dev/null 2>&1; then
  bun run test:vscode
else
  echo "warning: code-server not found; skipping tests/vscode"
fi
