#!/usr/bin/env bash
# Source from the code/web launchers. Starts the local cbm HTTP listener when
# available, unless CBM_AUTOSTART=0. Exports CBM_PORT/CBM_HTTP for Vite's proxy.
start_cbm() {
  local repo="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
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
  export CBM_PORT="$port"
  export CBM_HTTP="http://127.0.0.1:${port}"

  if command -v curl >/dev/null 2>&1 &&
    curl -fsS --max-time 1 "http://127.0.0.1:${port}/api/ui-config" >/dev/null 2>&1; then
    echo "== cbm already running on :${port}"
    return
  fi

  echo "== starting cbm on :${port} (log: out/cbm.log)"
  mkdir -p "$repo/out"
  ( sleep 2147483647 | "$bin" --ui=true --port="$port" >"$repo/out/cbm.log" 2>&1 ) &

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
