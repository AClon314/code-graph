# code-server as the remote harness

> Verified with code-server **4.141.0** (VS Code 1.141.0) and this extension's
> current `browser`-only manifest: the extension loads, `Code Graph: Open`
> creates the webview tab, and the orchgraph renderer switches normally.
> No `main` entry was needed.

## Why use it

`@vscode/test-web` serves a **web** workbench and puts the extension host on
`<uuid>.<host>`. That makes `--host=0.0.0.0` / IP access fail, because an IP
literal cannot be used as that subdomain. code-server is a normal server-side
VS Code: it binds any address, handles passwords/TLS, and serves the workbench
at a single origin. For remote use it is the simpler harness.

It is still VS Code, not vscode.dev: webviews, the Explorer, editors and the
extension host are the same concepts. The browser-only extension runs in the
web-worker style extension host that code-server starts.

## Dev install (symlink)

code-server discovers extensions by directory name. Use the `publisher.name`
and `version` from `package.json`:

```bash
cd /home/n/document/code/gpen/gpen-js/rules/cbm/graph-ui-svelte
export PATH="$HOME/.bun/bin:$PATH"
bun run build

EXT_DIR="$HOME/.local/share/code-server/extensions"
ln -sfn "$PWD" "$EXT_DIR/code-graph.code-graph-0.1.0"

code-server --bind-addr 0.0.0.0:8080 --auth password
```

Then open `http://<server>:8080`, and run **Code Graph: Open** from the Command
Palette. After rebuilding the webview/extension, run **Developer: Reload
Window**; code-server does not hot-reload the extension bundle.

The symlink is read-only from code-server's point of view: it points at the
repo, so `dist/webview`, `dist/extension.cjs` and `package.json` are live. Do not
put `node_modules` in the extension folder if you copy instead of symlink.

## VSIX install

For a normal install:

```bash
bunx @vscode/vsce package
code-server --install-extension code-graph-0.1.0.vsix
```

The VSIX should contain `package.json`, `dist/extension.cjs`,
`dist/webview/**`, and README/license files, not the source or `node_modules`.
Add a `.vscodeignore` when packaging becomes a real workflow.

## Caveats

- **cbm URL is still client-side.** The webview fetches `codeGraph.cbmBaseUrl`
  from the browser. A server-side `http://127.0.0.1:9749` is the *client's*
  loopback, not the code-server host. Either expose cbm on an address the browser
  can reach, use code-server's `/proxy/<port>/` path (if CORS allows), or move
  fetching into the extension host (the planned proxy).
- **Open VSX vs Marketplace.** Local symlink/VSIX bypasses the gallery. If this
  is published later, code-server users install from Open VSX or a VSIX.
- **Auth.** `--auth none` is only for a loopback test; expose it behind
  `--auth password` or a reverse proxy with TLS.
- **No test-web parity guarantees.** This is a different extension host
  (`LocalWebWorker` vs code-server's host). Keep `bun run gui` plus the
  Playwright smoke check for vscode.dev parity.

## Verified flow

Using a temporary extensions dir:

```text
extensions/
  code-graph.code-graph-0.0.1 -> /path/to/graph-ui-svelte
```

`code-server --bind-addr 127.0.0.1:8089 --auth none` loaded the extension,
`Code Graph: Open` rendered the graph, and switching Renderer from `D3` to
`orchgraph` replaced the SVG with the terminal-art canvas. The title shown by
that build was branded `Trae`, but the workbench and extension host behaved as
VS Code.
