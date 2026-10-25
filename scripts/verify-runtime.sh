#!/usr/bin/env bash
# Guard the build-time runtime split: each bundle must contain only its host.
set -euo pipefail

WEBVIEW="dist/webview/assets/webview.js"
EXTENSION="dist/extension.cjs"
FRESH="fresh-plugin/dist/code-nav.js"

for file in "$WEBVIEW" "$EXTENSION" "$FRESH"; do
  [ -f "$file" ] || { echo "missing build output: $file" >&2; exit 1; }
done

assert_contains() {
  local file="$1" needle="$2"
  grep -q -- "$needle" "$file" || { echo "expected '$needle' in $file" >&2; exit 1; }
}

assert_absent() {
  local file="$1" needle="$2"
  if grep -q -- "$needle" "$file"; then
    echo "unexpected '$needle' in $file (runtime was not tree-shaken)" >&2
    exit 1
  fi
}

assert_contains "$WEBVIEW" "acquireVsCodeApi"
assert_absent "$WEBVIEW" "getEditor"
assert_absent "$WEBVIEW" "9752"

assert_contains "$EXTENSION" "codeGraph.open"
assert_absent "$EXTENSION" "acquireVsCodeApi"
assert_absent "$EXTENSION" "getEditor"

assert_contains "$FRESH" "getEditor"
assert_absent "$FRESH" "acquireVsCodeApi"
assert_absent "$FRESH" "vscode.window"

echo "runtime split OK: webview / vscode / fresh"
