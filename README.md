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
- Workspace Trust: declared supported for untrusted and virtual workspaces, so
  the graph viewer is usable in Restricted Mode; cbm network access is still
  browser-side.
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
bun run gui
```

`gui` builds all bundles, checks `code-server` is on `PATH` (it exits with an
error if not), installs this extension into an isolated profile under
`.code-server/`, and starts code-server on the fixture workspace. Open the URL
printed by code-server (usually `https://127.0.0.1:8080`).

Defaults: `HOST=127.0.0.1 PORT=8080 AUTH=none`. For remote access:

```bash
HOST=0.0.0.0 AUTH=password PASSWORD=... bun run gui
```

The harness does not fall back to `@vscode/test-web`. See
[`docs/code-server.md`](docs/code-server.md) for debugging, Workspace Trust, and
the cbm network caveat.

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
- `bun run gui` is a code-server development harness, not a packaged VSIX
  workflow. It requires `code-server` on `PATH`.
- `deprecated-svelteUI` keeps the old shell for reference; do not add features
  there.
