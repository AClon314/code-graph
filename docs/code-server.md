# code-server as the GUI harness

`code-server` is the supported remote GUI harness. The extension has a Node
`main` host, so cbm requests run on the code-server machine and the webview only
receives `postMessage` responses. The remote browser never fetches cbm directly.

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
   generated certificate, and the caller's current directory. Override it with
   `WORKSPACE=/path/to/repo bun run gui`.

The launcher passes `--ignore-last-opened`, so the explicit workspace wins even
if code-server previously stored another folder in `.code-server/data/coder.json`
(for example after opening the e2e workspace).

`bun run gui` is `gui:private` (`HOST=127.0.0.1`, `PORT=8080`,
`AUTH=none`). Open the URL printed by code-server.

For LAN/public access:

```bash
bun run gui:public
# HOST=0.0.0.0 AUTH=password PASSWORD=cbm bash scripts/gui.sh
PASSWORD=... bun run gui:public
```

The default password `cbm` is a convenience, not a secret. Change it before
exposing the server beyond a trusted network.

`scripts/gui.sh` runs `bun run lazy_mkcert` and passes `out/certs/pub.pem` /
`out/certs/key.pem` to code-server. The certificate covers `localhost`, loopback
addresses, and addresses reported by `ip -j addr`. Existing files are reused;
`bun run lazy_mkcert --force` regenerates them.

After changing `out/dist/extension.cjs` or `out/dist/webview/**`, run
**Developer: Reload Window**. There is no extension hot reload.

## Debugging

code-server has no desktop-style F5 Extension Development Host. The practical
loop is the symlink above plus Reload Window.

The extension host is Node on the code-server machine. The webview is a separate
frame: use **Developer: Open Webview Developer Tools** for Svelte/UI breakpoints
(source maps are built). Server-side extension logs are in the code-server
terminal/log directory.

```bash
code-server --log debug ...   # or -vvv
```

Also check `~/.local/share/code-server/coder-logs` (or the isolated profile's
logs).

The extension is installed globally for the whole code-server process in
`.code-server/extensions`; switching folders should not remove its commands.
If **Code Graph** disappears, check that you are still on this profile/port
(`--extensions-dir` above) and run **Developer: Reload Window**. A different
code-server instance using the default extension directory will not have it.

## Workspace Trust / Restricted Mode

The manifest declares:

```json
"capabilities": {
  "untrustedWorkspaces": { "supported": true },
  "virtualWorkspaces": true
}
```

The graph viewer is allowed in Restricted Mode. It reads graph data and opens
files; it does not run workspace tasks or terminals. cbm is contacted by the
Node extension host, not by the browser.

## Manual install / VSIX

```bash
bun run build
bunx @vscode/vsce package
code-server --install-extension code-graph-0.1.0.vsix
```

The VSIX contains `package.json`, `out/dist/extension.cjs`,
`out/dist/webview/**`, and README/license files. Add a `.vscodeignore` when
packaging becomes a real workflow.

## Caveats

- **cbm must run where the extension host runs.** For code-server that is the
  server; for desktop VS Code it is the local machine. Remote/cross-origin cbm
  is unsupported.
- **vscode.dev is unsupported.** It has no Node extension host, and the browser
  host cannot run `config get` or bypass cbm's CORS policy.
- **Open VSX vs Marketplace.** Local symlink/VSIX bypasses the gallery. If this
  is published later, code-server users install from Open VSX or a VSIX.
- **Auth.** `--auth none` is for loopback only; use `AUTH=password
  PASSWORD=...` or a TLS reverse proxy for remote access.
