# code-graph

Call-graph UI for codebase-memory-mcp, delivered two ways from one graph core:

- **GUI (HTML)**: a VS Code Node extension. `Code Graph: Open (cbm)` and
  `Code Graph: Open (SCIP)` create separate editor tabs and mount the Svelte
  GUI in a webview. cbm requests are proxied by the extension host.
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
   Svelte webview       Node host             Fresh host
   (iframe)             (extension)           (QuickJS plugin)
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
| Fresh | `src/extension/hosts/fresh.ts` | `out/fresh-plugin/code-graph.js` |
| Browser dev | `src/extension/hosts/browser.ts` | `vite dev` / jump bridge |

`src/extension/host.ts` imports `#host`. Vite aliases `#host` to the webview
proxy for `vite build` and to the browser bridge for `vite dev`; esbuild aliases
it to Fresh for the plugin bundle. The VS Code extension entry imports its host
directly. Build output contains only the selected runtime:

- `out/dist/extension.cjs` — VS Code host, no `getEditor` / `acquireVsCodeApi`
- `out/dist/webview/assets/webview.js` — webview host, no `vscode` / Fresh / bridge
- `out/fresh-plugin/code-graph.js` — Fresh host, no `vscode` / webview

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
  the graph viewer is usable in Restricted Mode. cbm requests are made by the
  Node extension host, not the webview.
- Styling: VS Code `--vscode-*` theme tokens. `@vscode-elements/elements`
  provides `vscode-textfield` / `vscode-single-select`; buttons are native
  `<button>` elements using `--vscode-button-*`. The archived
  `@vscode/webview-ui-toolkit` is not used.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `codeGraph.source` | `cbm` | `mock` or `cbm` |
| `codeGraph.cbmBaseUrl` | `http://127.0.0.1:9749` | local cbm HTTP base; remote/cross-origin is unsupported |
| `codeGraph.project` | `demo` | fallback project for both backends |
| `codeGraph.cbmProject` | `codeGraph.project` | cbm-native project for `(cbm)` |
| `codeGraph.scipProject` | `codeGraph.project` | scip-cbm-writer project for `(SCIP)` |
| `codeGraph.symbolEntry` | `demo.src.features.useAlias` | initial graph root symbol entry (qualified name or `#id`) |

Mock works without a daemon. For `cbm`, the Node extension host runs
`config get ui_port`, probes that endpoint, then `codeGraph.cbmBaseUrl`, then
`http://127.0.0.1:9749` (duplicates are skipped). The webview only talks to the
host; it never fetches cbm directly. Remote/cross-origin cbm is not supported.
If no local cbm responds, the panel shows the full probe/stack error instead of
failing the whole webview.

### Project config

Team and personal workspace config live next to each other:

```text
code-graph.config.jsonc        # team defaults, typically committed
.code-graph.config.jsonc       # personal overrides, typically ignored
```

Both are JSONC and are merged at runtime by `priority` (larger wins). Equal
priorities keep canonical order: team first, personal last, so personal wins a
tie. The files are never written back; when neither exists, only the team file
is created.

```jsonc
// code-graph.config.jsonc
{
  "priority": 100,
  "backend": "cbm",
  "backends": {
    "cbm": { "project": "gpen-js" },
    "scip": { "project": "gpen-js-scip" }
  }
}
```

```jsonc
// .code-graph.config.jsonc
{
  "priority": 200,
  "symbolEntry": "gpen.src.main.main"
}
```

`symbolEntry` is the qualified name of the graph root. It is not a list, filter,
or cbm entry-point flag; `/api/symbol` calls it `qn` because cbm identifies any
node by qualified name.

### Indexing

`project` must name an existing cbm project; it is a database key, not a display
label. `bun run index` builds the project from this workspace:

```bash
bun run index --backend cbm    # codebase-memory-mcp indexer
bun run index --backend scip   # scip-typescript -> scip-cbm-writer
bun run index --backend both
```

Defaults:

- cbm project: workspace basename (`graph-ui-svelte`)
- SCIP project: `<cbm-project>-scip` (`graph-ui-svelte-scip`)
- cbm mode: `moderate`; use `--mode fast` for the quick filtered index

The SCIP path is intentionally an orchestrator over the two external tools; the
writer remains outside the cbm core. Re-run the command after source changes,
then press `r` in the graph panel. Existing project names can be listed with:

```bash
codebase-memory-mcp cli list_projects --format json
```

The Oclif entry point exposes the GUI/TUI inputs without a source checkout
around a script:

```bash
bun run graph --backend cbm --format both
bun run render --project graph-ui-svelte --symbol-entry pkg.main --format svg
bun run render --graph tui/fixture-graph.json --format orchgraph
```

`bun run cli graph ...` is the equivalent long form.

`graph` indexes first, then renders; `render` expects an existing project.
Both accept `--depth`, `--direction`, `--max-nodes`, `--cbm`,
`--layout-direction`, `--spacing`, and `--max-node-width`. On a TTY the default
is both formats, written to `code-graph.<project>.svg` and
`code-graph.<project>.txt`. When stdout is piped, the command streams one
format to stdout instead (default `orchgraph`) and writes no files; pass
`--format svg` for SVG, and do not use `--format both` in that mode. `--out`
sets the base path for file output and is ignored while streaming. Logs always
go to stderr.

The CLI is runtime code (`bin/run.ts` + `src/cli/`), unlike `test:*` and build
tooling. For a packaged release, ship the Oclif entry point/binary and keep the
`codebase-memory-mcp` binary (and optionally `scip-typescript`) as documented
runtime prerequisites; do not document `bun run index` for end users.

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

`bun run cbm` is a direct alias for `codebase-memory-mcp`; it does not add a
wrapper or start the UI by itself. Start the UI/HTTP listener explicitly:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun i -g codebase-memory-mcp@0.12.1

bun run cbm --ui=true --port=9751
```

`bun run gui` and `bun run gui:public` start this listener automatically when
it is not already healthy. They resolve `CBM_BIN`, then
`codebase-memory-mcp` on `PATH`, read `CBM_PORT` or
`codebase-memory-mcp config get ui_port`, and write logs to `out/cbm.log`.
The `gui` process itself still talks to cbm through the Node extension host.

`tui` installs the Fresh plugin only; start the cbm listener separately for
cbm-backed panels. When the global binary is on `PATH`, neither `gui` nor Fresh
needs `CBM_BIN`. If code-server or Fresh is launched from an environment
without `~/.bun/bin`, pass the binary explicitly:

```bash
CBM_BIN="$(command -v codebase-memory-mcp)" bun run gui
CBM_BIN="$(command -v codebase-memory-mcp)" fresh
```

If cbm is already running, verify it with
`curl http://127.0.0.1:9751/api/ui-config` instead of starting a second process.

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
out/dist/extension.cjs       VS Code Node extension
out/dist/webview/            Svelte webview bundle
out/fresh-plugin/code-graph.js Fresh plugin bundle
out/fresh-plugin/code-graph.ts Generated installable plugin
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
| `out/dist/extension.cjs` | VS Code Node extension (`main` entry) |
| `out/dist/webview/assets/webview.js` | Svelte app bundle |
| `out/dist/webview/assets/webview.css` | theme tokens + layout |
| `out/fresh-plugin/code-graph.js` | bundled Fresh plugin |
| `out/fresh-plugin/code-graph.ts` | generated installable Fresh plugin |

The extension manifest is the root `package.json` (`main`, command, settings).
The Node extension host is bundled with esbuild; the webview with Vite; the Fresh
plugin with esbuild + `#host` alias.

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
bun run tui
```

This installs the Fresh plugin, starts cbm when it is not already healthy, and
then launches Fresh. Use `TUI_NO_START=1 bun run tui` to install only, or
`CBM_AUTOSTART=0` to leave cbm alone. cbm logs go to `out/cbm.log`.

Fresh commands:

- **Code Graph: Open (cbm)**
- **Code Graph: Open (SCIP)**
- **Code Graph: Set Entry**
- **Code Graph: Toggle Sync On Workspace Change** (default OFF)

Inside an open graph, press `e` to change the root symbol, `r` to reload, and
`q` to close. The entry can be persisted in `code-graph.config.jsonc`:

```jsonc
{
  "symbolEntry": "graph-ui-svelte.tui.render.main"
}
```

or per backend with `backends.cbm.symbolEntry` / `backends.scip.symbolEntry`.
Config wins on `r`; a prompt/session selection is kept only when config has no
entry. If no entry is configured, the plugin lists cbm entry candidates.

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
otherwise a missing cache is rendered once with `tui/render.ts`. Local cbm
discovery first reads `codebase-memory-mcp config get ui_port` (set `CBM_BIN`
to override the executable), then probes 9749. The root entry comes from `symbolEntry` in project config, or
`CODE_NAV_ENTRY` / `CODE_NAV_SYMBOL_ENTRY`; if absent the plugin lists cbm entry
candidates in a prompt and uses the selection for the session. Module/folder
views are not implemented yet; the default funcs view has no folder root.

- `tui/frame.ts` builds the orchgraph frame.
- `tui/plugin.ts` paints it and uses the same `ExtensionApi` Fresh host for
  `openLocation` / `setStatus`.
- `out/fresh-plugin/code-graph.js` is the single-file QuickJS bundle;
  `bun run tui` generates `out/fresh-plugin/code-graph.ts` and installs it.

## Checks

```bash
bun run check           # svelte-check, includes extension host types
bun test                # graph, neighborhood, layout, fonts, host adapter
bun run test:fresh      # Termwright e2e against a real Fresh PTY
bun run test:vscode     # Playwright e2e against code-server + webview
bun run test:e2e        # both e2e suites
bun run build           # all three bundles
bun run verify:runtime  # assert each bundle contains only its host
```

Tests live under `tests/`: unit tests at the root, `tests/fresh/` for
Termwright, and `tests/vscode/` for Playwright. Termwright needs Node 22 or 24;
`tests/fresh/run.ts` resolves one automatically or accepts `NODE_BIN`.

## LIMITATIONS

- **vscode.dev is unsupported.** The extension uses a Node `main` host and
  proxies cbm there. Browser-only VS Code hosts cannot execute `config get` or
  avoid CORS; use desktop VS Code or code-server instead.
- **Remote/cross-origin cbm is unsupported.** cbm is expected on the same
  machine as the extension host (desktop local or the code-server server).
- No embedded code editor; navigation is `openLocation`.
- `bun run gui` is a code-server development harness, not a packaged VSIX
  workflow. It requires `code-server` on `PATH`.
- `deprecated-svelteUI` keeps the old shell for reference; do not add features
  there.
