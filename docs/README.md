# code-graph docs

This branch (`main`) is a fresh orphan branch. The previous Svelte-only GUI lives
on `deprecated-svelteUI`. This directory records the new direction before the
implementation is rebuilt.

## Direction

- **GUI (HTML)**: a VS Code extension that runs in VS Code for the Web, with the
  graph UI in a webview. VS Code owns the shell, Explorer, editors, command
  palette, and file tree. The webview no longer draws a file tree.
- **TUI**: unchanged. It keeps using the Fresh API and the shared graph/frame
  code; it does not depend on VS Code APIs.
- **Local GUI test**: `bun run gui` builds the extension + webview and starts
  VS Code for the Web through `@vscode/test-web`.
- **UI framework**: Svelte 5 in the webview is supported. There is no official
  Microsoft Svelte template; the official scaffold is `yo code` **New Web
  Extension (TypeScript)**, then add Vite + Svelte.

## Documents

| Document | Contents |
|---|---|
| [`official-templates.md`](./official-templates.md) | `yo code` template list, `vscode-extension-samples`, `vscode-test-web`, webview UI library status, recommendation. |
| [`webview-svelte.md`](./webview-svelte.md) | How to build the webview with Svelte 5 + Vite, CSP, `asWebviewUri`, message passing, native Explorer/TreeView, theming, pitfalls. |
| [`vscode-web-testing.md`](./vscode-web-testing.md) | `@vscode/test-web` usage, `bun run gui`, headless/Playwright, CORS, test split. |

## Key official links

- Extension generator: <https://github.com/microsoft/vscode-generator-code>
- Extension samples: <https://github.com/microsoft/vscode-extension-samples>
- Web extensions guide: <https://code.visualstudio.com/api/extension-guides/web-extensions>
- Webview guide: <https://code.visualstudio.com/api/extension-guides/webview>
- Tree view guide: <https://code.visualstudio.com/api/extension-guides/tree-view>
- Web test harness: <https://github.com/microsoft/vscode-test-web>
- Webview UI Toolkit deprecation: <https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561>

## Decisions already made

1. Use a **web extension** (`browser` entry) so the same package works in
   vscode.dev and in `@vscode/test-web`; add a `main` entry only if desktop-only
   features need Node.
2. Use **native Explorer** for files. If a filtered view is needed, use
   `TreeDataProvider` / `TreeView`, not a webview tree.
3. Use a **webview for the graph** (`createWebviewPanel` for an editor tab, or
   `WebviewViewProvider` for a sidebar/panel view).
4. Use **Svelte 5 + Vite** for the webview; keep `src/graph/` framework-free and
   shared with the TUI.
5. Use **`@vscode/test-web`** as the GUI launch/test harness.
6. Do **not** add `@vscode/webview-ui-toolkit`; it is archived/deprecated.

## Open questions

- Graph panel vs. graph sidebar view: editor tab gives space; a `WebviewView` is
  more integrated but narrower. Both can share the same Svelte app.
- How the webview reaches CBM: extension-host `fetch` + `postMessage`, or direct
  webview `fetch`. In vscode.dev both are subject to CORS; the extension host is
  the cleaner choke point.
- Whether the extension needs a desktop `main` entry for local process access
  (CBM server, language tooling). If yes, share the core and keep `browser`
  feature-parity for the web path.
- Font strategy inside the webview: reuse the local-first Maple detection + CDN
  fallback, but add the CDN host to CSP and keep `no-referrer`.
- Whether the old `deprecated-svelteUI` assets should be ported (components,
  layout, terminal art) or only the pure graph/terminal modules.
