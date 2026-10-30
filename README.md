# code-graph

Call-graph UI for codebase-memory-mcp, delivered two ways from one graph core:

- **GUI (HTML)**: a VS Code web extension. `Code Graph: Open (cbm)` and
  `Code Graph: Open (SCIP)` create separate editor tabs and mount the Svelte
  GUI in a webview.
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
| Fresh | `src/extension/hosts/fresh.ts` | `out/fresh-plugin/code-nav.js` |
| Browser dev | `src/extension/hosts/browser.ts` | `vite dev` / jump bridge |

`src/extension/host.ts` imports `#host`. Vite aliases `#host` to the webview
proxy for `vite build` and to the browser bridge for `vite dev`; esbuild aliases
it to Fresh for the plugin bundle. The VS Code extension entry imports its host
directly. Build output contains only the selected runtime:

- `out/dist/extension.cjs` — VS Code host, no `getEditor` / `acquireVsCodeApi`
- `out/dist/webview/assets/webview.js` — webview host, no `vscode` / Fresh / bridge
- `out/fresh-plugin/code-nav.js` — Fresh host, no `vscode` / webview

## GUI

- Commands: **Code Graph: Open (cbm)** (`codeGraph.openCbm`) and
  **Code Graph: Open (SCIP)** (`codeGraph.openScip`).
- Each backend opens its own editor tab; invoking the same command again
  reveals that tab. The two tabs can be compared side by side.
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
| `codeGraph.source` | `cbm` | `mock` or `cbm` |
| `codeGraph.cbmBaseUrl` | `http://127.0.0.1:9749` | cbm HTTP base |
| `codeGraph.project` | `demo` | fallback project for both backends |
| `codeGraph.cbmProject` | `codeGraph.project` | cbm-native project for `(cbm)` |
| `codeGraph.scipProject` | `codeGraph.project` | scip-cbm-writer project for `(SCIP)` |
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

`bun run gui` is an alias for `bun run gui:private`:
`HOST=127.0.0.1 PORT=8080 AUTH=none`.

`gui` first runs `bun run lazy_mkcert`, which writes `out/certs/pub.pem` and
`out/certs/key.pem` and gives code-server a browser-trusted certificate for
`localhost`, the loopback addresses, and every address reported by
`ip -j addr`. Existing certificates are kept; use `bun run lazy_mkcert --force`
to regenerate after changing networks. If generation fails but both PEM files
exist, the harness warns and continues with them; if they are missing it warns
and lets code-server use its own TLS settings.

Clients on another machine may optionally install the server's mkcert
`rootCA.pem` to remove the certificate warning. Browsers still allow visiting a
site with an untrusted certificate after the interstitial, so this is optional.

Extra names can be supplied for hosts that are not local interfaces:

```bash
CERT_IP_URL="devbox.local 10.0.0.42" bun run lazy_mkcert --force
bun run lazy_mkcert --force extra.example 192.0.2.10
```

All build and harness artifacts are under the git-ignored `out/` directory:

```text
out/dist/extension.cjs       VS Code web extension
out/dist/webview/            Svelte webview bundle
out/fresh-plugin/code-nav.js Fresh plugin bundle
out/tui/frame.json           precomputed TUI frame
out/certs/                   generated TLS certificate and key
```

Public/LAN mode:

```bash
bun run gui:public
# HOST=0.0.0.0 PORT=8080 AUTH=password PASSWORD=cbm
PASSWORD=... bun run gui:public   # override the default password
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
| `out/dist/extension.cjs` | VS Code web extension (`browser` entry) |
| `out/dist/webview/assets/webview.js` | Svelte app bundle |
| `out/dist/webview/assets/webview.css` | theme tokens + layout |
| `out/fresh-plugin/code-nav.js` | bundled Fresh plugin |

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
bash fresh-plugin/install.sh
```

Fresh commands:

- **Code Nav: Open Graph (cbm)**
- **Code Nav: Open Graph (SCIP)**
- **Code Nav: Toggle Sync On Workspace Change** (default OFF)

Each window keeps one panel per backend. The frame cache lives in the active
workspace:

```text
<workspace>/.codebase-memory/code-graph/cbm/frame.json
<workspace>/.codebase-memory/code-graph/scip/frame.json
```

A convenience link is written to the user cache after a successful render:

```text
~/.cache/code-graph/frames/<root+backend hash>.json
  -> <workspace>/.codebase-memory/code-graph/<backend>/frame.json
```

`CODE_NAV_FRAME_MODE=static` forces reading that cache and never renders;
otherwise a missing cache is rendered once with `tui/render.ts --cbm`. The root
entry must be explicit (`CODE_NAV_ENTRY` or `CODE_NAV_SYMBOL`); if absent the
plugin lists cbm entry candidates in a prompt and uses the selection for the
session. Module/folder views
are not implemented yet; the default funcs view has no folder root.

- `tui/frame.ts` builds the orchgraph frame.
- `fresh-plugin/code-nav.ts` paints it and uses the same `ExtensionApi` Fresh
  host for `openLocation` / `setStatus`.
- `out/fresh-plugin/code-nav.js` is the single-file QuickJS bundle.

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
