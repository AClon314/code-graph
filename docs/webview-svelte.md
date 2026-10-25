# Svelte in a VS Code webview

> Short answer: **yes**. A VS Code webview is an iframe running ordinary HTML/CSS/JS.
> Svelte compiles to that. There is no React requirement and no official Svelte
> template; you add Vite + Svelte yourself.

This document describes the shape that fits code-graph: a browser-safe VS Code
extension (web extension) hosting one or more webviews built with Svelte 5.

## Architecture

```text
VS Code for the Web (vscode.dev / @vscode/test-web)
├── extension host (WebWorker)          <- TypeScript, no DOM, no Node
│   ├── package.json "browser" entry
│   ├── commands / TreeView / workspace.fs
│   └── webview.html + postMessage
└── webview (iframe)                    <- Svelte app
    ├── Svelte 5 components
    ├── SVG/canvas graph
    └── acquireVsCodeApi() <-> postMessage
```

The extension host owns VS Code integration and data access. The webview owns
rendering. The webview never imports `vscode`; it uses `postMessage`.

## Project layout

```text
package.json                 # extension manifest, "browser" entry
src/web/extension.ts         # activate(), commands, webview panel/view
src/web/graphPanel.ts        # HTML + CSP + asWebviewUri + message bridge
src/graph/                   # shared pure graph model/layout (no DOM, no vscode)
webview/
  index.html                 # Vite entry, only <div id="app">
  src/main.ts                # mount(App)
  src/App.svelte
  src/lib/bridge.ts          # typed postMessage wrapper
vite.webview.config.ts
dist/
  web/extension.js           # bundled browser extension
  webview/assets/webview.js  # bundled Svelte app
  webview/assets/webview.css
```

Keep `src/graph/` framework-free so the TUI/Fresh frame builder and the webview
can share it. Do not import Svelte or `vscode` from that shared core.

## Extension side: create the webview

```ts
// src/web/graphPanel.ts
import * as vscode from "vscode";

export function showGraphPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "codeGraph.graph",
    "Code Graph",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      // Narrow this to the built webview directory only.
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")],
    },
  );

  const root = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "assets", "webview.js"),
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "assets", "webview.css"),
  );

  // No inline script: the bundle is loaded as an external module.
  const csp = [
    "default-src 'none'",
    `img-src ${panel.webview.cspSource} data:`,
    `font-src ${panel.webview.cspSource}`,
    `style-src ${panel.webview.cspSource}`,
    `script-src ${panel.webview.cspSource}`,
  ].join("; ");

  panel.webview.html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Code Graph</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;

  panel.webview.onDidReceiveMessage((message) => {
    // Treat the webview as untrusted input; validate the discriminator and fields.
    if (message?.type === "ready") {
      panel.webview.postMessage({ type: "graph", data: loadGraphData() });
    }
  });

  return panel;
}
```

Notes:

- `asWebviewUri` is mandatory for every local asset. A relative `./assets/x.js`
  resolves against the webview origin, not the extension directory.
- `enableScripts: true` is required for Svelte.
- Keep `localResourceRoots` narrow; `[]` if the webview does not need local files.
- No inline `<script>` means no nonce is needed. If you add an inline bootstrap,
  add a nonce to both the tag and `script-src`.
- `webview.cspSource` is the only origin that should be allowed for extension
  assets. Do not widen `script-src` to `https:` or `'unsafe-eval'`.

## Webview side: mount Svelte 5

```html
<!-- webview/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Code Graph</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```ts
// webview/src/main.ts
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");
if (!target) throw new Error("webview: #app is missing");
mount(App, { target });
```

Svelte 5 runes (`$state`, `$derived`, `$effect`) work normally. This is a normal
browser app; there is no SSR and no SvelteKit runtime requirement.

### Typed message bridge

```ts
// webview/src/lib/bridge.ts
export type HostToWebview =
  | { type: "graph"; data: GraphViewData }
  | { type: "selection"; file: string; line: number };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "jump"; file: string; line: number };

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi() may be called only once per webview.
const vscode = acquireVsCodeApi();

export function postToHost(message: WebviewToHost): void {
  vscode.postMessage(message);
}

export function onHostMessage(handler: (message: HostToWebview) => void): () => void {
  const listener = (event: MessageEvent<HostToWebview>) => handler(event.data);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
```

In Svelte, create the subscription in `onMount` and return the cleanup; do not
call `acquireVsCodeApi()` inside a component that may be instantiated twice.

## Vite build

Build the webview as a standalone app with fixed asset names so the extension can
reference the files without parsing Vite's manifest:

```ts
// vite.webview.config.ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "webview",
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/webview.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
```

The webview is served from the extension bundle, not from a dev server. For local
iteration use `vite build --watch` (and reload the webview), not `vite dev`.
A dev server would require relaxing CSP (`connect-src`, websocket) and does not
exist in `vscode.dev`.

Do **not** use SvelteKit SSR here. If you want SvelteKit, use `adapter-static` with
`ssr = false`, but a plain Vite + Svelte setup has fewer moving parts.

## Native file tree instead of a custom one

The old GUI drew its own file tree. In VS Code:

- Use the built-in Explorer for workspace files. It already handles virtual file
  systems, multi-root workspaces, `github.dev`, and remote workspaces.
- If you need a filtered tree (for example, only graph-relevant files), implement
  a native `TreeDataProvider` + `TreeView`; do not build a tree inside the
  webview. See `tree-view-sample`.
- Use the webview for the graph canvas/editor, which the native APIs cannot draw.

Jumping from a graph node to source:

```ts
async function openLocation(file: vscode.Uri, line: number): Promise<void> {
  const document = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const position = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenter,
  );
}
```

For web extensions, construct the URI through the workspace:
`vscode.Uri.joinPath(workspaceFolder.uri, relativePath)`, not `Uri.file(...)`.
The workspace may be a virtual `vscode-test-web://` or `vscode-vfs://` file system.

## Theming and fonts

VS Code injects theme variables into every webview:

```css
:global(html) {
  color-scheme: light dark;
}

:global(body) {
  margin: 0;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
}

.code {
  font-family:
    "Maple Mono NF CN",
    var(--vscode-editor-font-family),
    monospace;
}
```

The existing `fonts.ts` detection/CDN fallback can be reused almost unchanged:
canvas measurement runs in the webview's browser context. Add the CDN to CSP:

```text
style-src ${webview.cspSource} https://fontsapi.zeoseven.com;
font-src ${webview.cspSource} https://fontsapi.zeoseven.com;
```

Keep `referrerPolicy="no-referrer"` on the CDN `<link>`; the CDN returns an empty
response for some IP-literal referrers. For air-gapped/offline builds, skip the
CDN and rely on the local fallback stack.

## Security checklist

- `enableScripts: true` only when needed; `localResourceRoots` as narrow as possible.
- Strict CSP: `default-src 'none'`, no `'unsafe-eval'`, no remote `script-src`.
- No `innerHTML` with graph labels, file paths, or source text. Svelte escapes
  text by default; keep it that way.
- Validate every `postMessage` payload in the extension host; the webview is a
  separate, potentially compromised context.
- Do not put secrets in the webview bundle or in `postMessage`.
- Prefer `vscode.setState`/`getState` over `retainContextWhenHidden`. The latter
  keeps a hidden webview alive and is memory-expensive.
- If the webview fetches an API directly, add only that origin to `connect-src`.
  Better: fetch in the extension host and forward the result, so the webview
  stays CSP-locked to extension assets.

## Testing Svelte UI

- Pure graph/layout logic: unit-test with `bun test` / Vitest, no VS Code needed.
- Svelte components: Vitest + `@testing-library/svelte` (jsdom) for component
  behavior and message handling.
- Full integration: launch VS Code for the Web with `@vscode/test-web` and drive
  the webview iframe with Playwright. See [`vscode-web-testing.md`](./vscode-web-testing.md).
- Extension-host tests (commands, TreeView, file system) run inside the web
  extension host via `@vscode/test-web --extensionTestsPath=...`.

## Pitfalls

1. **`acquireVsCodeApi()` twice** throws. Keep one module-level instance.
2. **Relative asset paths** do not point at the extension. Use `asWebviewUri`.
3. **Vite dev server** is not a webview. Build, or relax CSP for local dev only.
4. **No Node** in a web extension or webview. Use `vscode.workspace.fs` and `fetch`.
5. **State loss** when the webview tab is hidden. Persist through the extension.
6. **CORS** applies to `fetch` from both the web extension host and the webview in
   vscode.dev. A local CBM server needs CORS headers, or a same-origin proxy, or a
   desktop `main` entry.
7. **Svelte scoped CSS** does not style `body`/`html`; use `:global(...)` for those.
8. **Webview UI Toolkit is deprecated**; do not add it for new code.
