# code-server as the GUI harness

> Verified with code-server **4.141.0** (VS Code 1.141.0) and this extension's
> current `browser`-only manifest: the extension loads, `code-graph: Open (cbm)`
> creates the webview tab, and switching Renderer from `D3` to `orchgraph`
> replaces the SVG with the terminal-art canvas. No `main` entry is needed.

`bun run gui` starts code-server. `@vscode/test-web` is no longer used; it builds
the extension host URL as `<uuid>.<host>`, and an IP literal in that position is
not a valid URL, so `--host=0.0.0.0` / LAN access fails. code-server binds any
address, handles auth/TLS, and serves everything from one origin.

## Start

```bash
cd /home/n/document/code/gpen/gpen-js/rules/cbm/graph-ui-svelte
bun run gui
```

The script:

1. exits with `127` if `code-server` is not on `PATH`;
2. runs `bun run lazy_mkcert`, then `bun run build`;
3. symlinks this repo into `.code-server/extensions/<publisher>.<name>-<version>`;
4. starts code-server with an isolated `.code-server/data` profile, the
   generated certificate, and `fixtures/workspace`.

`bun run gui` is an alias for `bun run gui:private`: `HOST=127.0.0.1`,
`PORT=8080`, `AUTH=none`. Open the URL printed by code-server (usually
`https://127.0.0.1:8080`).

For LAN/public access:

```bash
bun run gui:public
# equivalent to:
HOST=0.0.0.0 AUTH=password PASSWORD=cbm bash scripts/gui.sh

PASSWORD=... bun run gui:public   # override the default password
```

The default password `cbm` is a convenience, not a secret. Change it before
exposing the server beyond a trusted network.

`AUTH=none` on a non-loopback host prints a warning. Before building,
`scripts/gui.sh` runs `bun run lazy_mkcert`; the generated
`out/certs/pub.pem` / `out/certs/key.pem` are passed to code-server with
`--cert` / `--cert-key`. The certificate covers `localhost`, the loopback
addresses, and every address reported by `ip -j addr`, so a LAN client can use
the same browser-trusted CA. Existing files are reused; `bun run lazy_mkcert
--force` regenerates them. If generation fails and both PEM files are missing,
the harness warns and lets code-server use its own TLS settings.

Remote clients can optionally install the server's mkcert `rootCA.pem` to
silence the warning. It is not required: current browsers still offer a
"proceed anyway" path for an untrusted certificate.

After changing `out/dist/extension.cjs` or `out/dist/webview/**`, run
**Developer: Reload Window**. There is no hot reload of the extension bundle.

## Debugging

code-server does not provide desktop VS Code's F5 **Extension Development Host**
window, and its CLI has no `--extensionDevelopmentPath`. The practical loop is
the symlink above plus Reload Window.

For the current browser-only extension, the extension host is a **Web Worker**:

1. Open the code-server page in Chromium.
2. DevTools → **Sources** → **Workers** → `webWorkerExtensionHostIframe`.
3. Open `out/dist/extension.cjs`; `out/dist/extension.cjs.map` maps
   breakpoints back to `src/extension/*.ts`.
4. `console.*` from the extension appears in the DevTools console.

The webview is a separate frame:
**Developer: Open Webview Developer Tools** from the Command Palette. Its
production bundle is built with a source map
(`out/dist/webview/assets/webview.js.map`), so breakpoints map back to
`src/**/*.svelte` / `src/**/*.ts`.

Server/browser logs:

```bash
code-server --log debug ...   # or -vvv
```

Also check `~/.local/share/code-server/coder-logs` (or the isolated profile's
logs) and the browser console.

If you later need official-style Node breakpoints, the trade-off is adding a
Node `main` entry next to `browser`, then attaching a Node inspector to the
server-side extension host. That is more moving parts; the DevTools loop above
is enough for the current web extension.

## Workspace Trust / Restricted Mode

code-server supports VS Code **Workspace Trust**; `code-server
--disable-workspace-trust` exists for the current session. The manifest now
declares:

```json
"capabilities": {
  "untrustedWorkspaces": { "supported": true },
  "virtualWorkspaces": true
}
```

So the graph viewer is allowed in Restricted Mode and in virtual workspaces
(vscode.dev). It only reads graph data and opens files; it does not run workspace
tasks or terminals. cbm is still fetched by the **browser**, not the extension
host, so Workspace Trust does not grant network access.

## Manual install / VSIX

For a normal code-server install:

```bash
bun run build
bunx @vscode/vsce package
code-server --install-extension code-graph-0.1.0.vsix
```

The VSIX should contain `package.json`, `out/dist/extension.cjs`,
`out/dist/webview/**`, and README/license files — not the source or
`node_modules`. Add a `.vscodeignore` when packaging becomes a real workflow.

## Caveats

- **cbm URL is client-side.** The webview fetches `codeGraph.cbmBaseUrl` from
  the browser. A server-side `http://127.0.0.1:9749` is the *client's* loopback,
  not the code-server host. Expose cbm on a browser-reachable address, use
  code-server's `/proxy/<port>/` path (if CORS allows), or move fetching into the
  extension host later.
- **Open VSX vs Marketplace.** Local symlink/VSIX bypasses the gallery. If this
  is published later, code-server users install from Open VSX or a VSIX.
- **Auth.** `--auth none` is for loopback only; use `AUTH=password
  PASSWORD=...` or a TLS reverse proxy for remote access.
- **Different host than vscode.dev.** The browser-only extension runs in
  code-server's web-worker host. `bun run dev` remains the standalone browser
  host for quick UI work.
