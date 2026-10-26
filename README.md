# code-graph

Call-graph UI for codebase-memory-mcp, delivered two ways from one graph core:

- **GUI (HTML)**: a VS Code web extension. `Code Graph: Open` creates a new
  editor tab and mounts the Svelte GUI in a webview.
- **TUI**: unchanged. Fresh consumes a precomputed orchgraph frame through the
  Fresh API.

The old standalone Svelte shell (with its own file tree) is preserved on the
`deprecated-svelteUI` branch. This branch is the VS Code extension rewrite.

## Architecture

```text
              ┌──────────────────────────────┐
              │ src/lib/graph (pure graph)   │
              │ MockSource / CbmHttpSource   │
              └──────────────┬───────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   Svelte webview       VS Code host          Fresh host
   (iframe)             (WebWorker)           (QuickJS plugin)
        │                    │                    │
   postMessage  <──────>  ExtensionApi  <──────>  ExtensionApi
```

### Unified editor API

`src/extension/api.ts` defines the only editor-facing contract:

```ts
getConfig(): Promise<ExtensionConfig>
openLocation(location: SourceLocation): Promise<void>
setStatus(message, kind?): void
```

Implementations:

| Runtime | File | Used by |
|---|---|---|
| VS Code | `src/extension/hosts/vscode.ts` | extension host |
| Webview | `src/extension/hosts/webview.ts` | Svelte app (postMessage proxy) |
| Fresh | `src/extension/hosts/fresh.ts` | `fresh-plugin/dist/code-nav.js` |
| Browser dev | `src/extension/hosts/browser.ts` | `vite dev` / jump bridge |

`src/extension/host.ts` imports `#host`. Vite aliases `#host` to the webview
proxy for `vite build` and to the browser bridge for `vite dev`; esbuild aliases
it to Fresh for the plugin bundle. The VS Code extension entry imports its host
directly. Build output contains only the selected runtime:

- `dist/extension.cjs` — VS Code host, no `getEditor` / `acquireVsCodeApi`
- `dist/webview/assets/webview.js` — webview host, no `vscode` / Fresh / bridge
- `fresh-plugin/dist/code-nav.js` — Fresh host, no `vscode` / webview

## GUI

- Command: **Code Graph: Open** (`codeGraph.open`).
- Opens one editor tab; invoking again reveals the existing tab.
- File tree: **VS Code Explorer**, not a webview. The old tree panel is removed.
- Graph: D3/SVG or the orchgraph character canvas, with search, depth,
  direction, fit, SVG export / copy.
- Details: symbol bundle, callers/callees, **Jump** opens the file at the
  symbol's 1-based line through `ExtensionApi.openLocation`.
- Styling: VS Code `--vscode-*` theme tokens. `@vscode-elements/elements`
  provides `vscode-textfield` / `vscode-single-select`; buttons are native
  `<button>` elements using `--vscode-button-*`. The archived
  `@vscode/webview-ui-toolkit` is not used.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `codeGraph.source` | `mock` | `mock` or `cbm` |
| `codeGraph.cbmBaseUrl` | `http://127.0.0.1:9749` | cbm HTTP base |
| `codeGraph.project` | `demo` | initial project |
| `codeGraph.symbol` | `demo.src.features.useAlias` | initial root symbol |

Mock works without a daemon. For `cbm`, the webview fetches `cbmBaseUrl`
directly; in vscode.dev that request is subject to CORS.

## Run

```bash
bun install

# Build extension + webview + Fresh plugin
bun run build

# Serve VS Code for the Web with the extension and fixture workspace.
# No browser is launched; open http://localhost:3000 yourself.
bun run gui

# Local convenience: launch Chromium against localhost instead.
bun run gui:open
```

`gui` uses `@vscode/test-web --browser=none`, so it no longer launches a browser.
The first run downloads a VS Code web build into `.vscode-test-web/` (ignored).
Override the port with `PORT=3001 bun run gui`.

`gui:open` launches Playwright's Chromium; if it is missing, install it once:

```bash
bunx playwright install chromium
```

The fixture workspace is `fixtures/workspace/`. Open the URL and run **Code
Graph: Open** from the Command Palette.

### Remote access

Use an SSH tunnel:

```bash
ssh -L 3000:localhost:3000 <server>
# then open http://localhost:3000 on the client
```

Do **not** set `HOST=0.0.0.0` or an IP. `@vscode/test-web` puts the extension
host on `<uuid>.<host>`, and an IP literal in that position is not a valid URL,
so the extension host fails to start (`Failed to construct 'URL': Invalid URL`).
`localhost` works because `*.localhost` resolves to loopback on the client, and
the tunnel forwards the port. If you need direct LAN access, use a hostname with
a wildcard DNS record (e.g. `HOST=vscode.example.com`), not an IP.

`gui:open` is local-only for the same reason. Plain `http://<lan-ip>:3000` is
not supported by the harness.

### code-server alternative

If you want direct remote access and a normal authenticated server, use
code-server instead. The current `browser`-only extension loads there without a
`main` entry:

```bash
bun run build
ln -sfn "$PWD" "$HOME/.local/share/code-server/extensions/code-graph.code-graph-0.1.0"
code-server --bind-addr 0.0.0.0:8080 --auth password
```

Reload the window after rebuilding. See [`docs/code-server.md`](docs/code-server.md)
for the verified flow and caveats (the webview still fetches cbm from the
browser, so a server-side `127.0.0.1` is not automatically reachable).

Standalone webview development (no VS Code shell):

```bash
bun run dev
# http://127.0.0.1:5173
```

`vite dev` uses the browser host; Jump goes through the JSON-RPC bridge:

```bash
bun run jump:bridge
```

## Build outputs

| Output | Purpose |
|---|---|
| `dist/extension.cjs` | VS Code web extension (`browser` entry) |
| `dist/webview/assets/webview.js` | Svelte app bundle |
| `dist/webview/assets/webview.css` | theme tokens + layout |
| `fresh-plugin/dist/code-nav.js` | bundled Fresh plugin |

The extension manifest is the root `package.json` (`browser`, command,
settings). The extension host is bundled with esbuild; the webview with Vite;
the Fresh plugin with esbuild + `#host` alias.

## Fonts

Graph text uses `--font-code`: Maple Mono NF CN first, then UbuntuMono Nerd Font,
Victor Mono, Noto Sans Mono, DejaVu Sans Mono, Adwaita Mono, monospace.

`src/lib/fonts.ts` measures the family in the **client** browser. If installed,
there is no network request. Otherwise it appends the ZeoSeven stylesheet with
`referrerPolicy="no-referrer"` and loads only the ASCII/character-art blocks;
CJK blocks load when a label needs them. CSP allows
`https://fontsapi.zeoseven.com` in `style-src` and `font-src`. A failed/slow CDN
keeps the local stack.

The orchgraph root marker is `⠋` (braille), not `◐`: U+25D0 is not covered by
the CDN font and falls back to a proportional glyph. Braille is exactly one cell.

## TUI / Fresh

The TUI path is independent of VS Code:

```bash
bun run tui/render.ts --graph tui/fixture-graph.json --out tui/frame.json
bash fresh-plugin/install.sh
```

- `tui/frame.ts` builds the orchgraph frame.
- `fresh-plugin/code-nav.ts` paints it and uses the same `ExtensionApi` Fresh
  host for `openLocation` / `setStatus`.
- `fresh-plugin/dist/code-nav.js` is the single-file QuickJS bundle.

## Checks

```bash
bun run check          # svelte-check, includes extension host types
bun test               # graph, neighborhood, layout, fonts, host adapter
bun run build          # all three bundles
bun run verify:runtime # assert each bundle contains only its host
```

## Limits

- No embedded code editor; navigation is `openLocation`.
- The webview still talks to cbm directly. A web extension host proxy would
  avoid CORS for vscode.dev, but is not implemented yet.
- `bun run gui` is a development harness, not a packaged VSIX workflow.
- `deprecated-svelteUI` keeps the old shell for reference; do not add features
  there.
