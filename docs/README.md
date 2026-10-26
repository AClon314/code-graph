# code-graph docs

This branch (`main`) is a fresh orphan branch. The previous Svelte-only GUI lives
on `deprecated-svelteUI`. This directory records the new direction and the
current implementation.

## Direction

- **GUI (HTML)**: a VS Code extension that runs in VS Code for the Web, with the
  graph UI in a webview. VS Code owns the shell, Explorer, editors, command
  palette, and file tree. The webview no longer draws a file tree.
- **TUI**: unchanged. It keeps using the Fresh API and the shared graph/frame
  code; it does not depend on VS Code APIs.
- **Local/remote GUI test**: `bun run gui` builds the extension + webview and
  starts code-server on the fixture workspace. It exits if code-server is not
  installed.
- **UI framework**: Svelte 5 in the webview is supported. There is no official
  Microsoft Svelte template; the official scaffold is `yo code` **New Web
  Extension (TypeScript)**, then add Vite + Svelte.

## Implemented on this branch

- `codeGraph.open` command opens a VS Code editor tab (`WebviewPanel`) with the
  migrated Svelte GUI. The custom file tree is gone; VS Code's Explorer is the
  file tree.
- `src/extension/api.ts` defines the shared `ExtensionApi`
  (`getConfig`, `openLocation`, `setStatus`). Implementations live in
  `src/extension/hosts/{vscode,fresh,webview,browser}.ts`.
- `src/extension/host.ts` imports `#host`; Vite aliases it to the webview proxy,
  esbuild aliases it to Fresh for the plugin bundle, and the extension entry
  imports the VS Code host directly. The other hosts are tree-shaken out.
- The webview uses VS Code theme tokens and `@vscode-elements/elements` for
  text fields/dropdowns; buttons are native `<button>` elements styled with
  `--vscode-button-*`. No archived Webview UI Toolkit.
- `bun run gui` builds all three bundles and starts code-server with this
  extension installed in an isolated `.code-server/` profile, opening
  `fixtures/workspace`. Missing code-server is a hard error; there is no
  test-web fallback.

## Documents

Current documents:

| Document | Contents |
|---|---|
| [`multi-workspace.md`](./multi-workspace.md) | Feasibility notes for multi-root VS Code and multi-window Fresh, and the shared workspace API. |
| [`code-server.md`](./code-server.md) | code-server as the GUI harness; install, debugging, Workspace Trust, caveats. |

Historical documents (archived, not current guidance):

| Document | Contents |
|---|---|
| [`history/official-templates.md`](./history/official-templates.md) | Historical `yo code` template list, `vscode-extension-samples`, `vscode-test-web`, webview UI library status, recommendation. |
| [`history/webview-svelte.md`](./history/webview-svelte.md) | Historical guide for building the webview with Svelte 5 + Vite, CSP, `asWebviewUri`, message passing, native Explorer/TreeView, theming, pitfalls. Its project layout is outdated. |
| [`history/vscode-web-testing.md`](./history/vscode-web-testing.md) | Historical `@vscode/test-web` notes; no longer used by `bun run gui`. |

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
   vscode.dev and in code-server; add a `main` entry only if desktop-only
   features need Node.
2. Use **native Explorer** for files. If a filtered view is needed, use
   `TreeDataProvider` / `TreeView`, not a webview tree.
3. Use a **webview for the graph** (`createWebviewPanel` for an editor tab, or
   `WebviewViewProvider` for a sidebar/panel view).
4. Use **Svelte 5 + Vite** for the webview; keep `src/lib/graph/` framework-free and
   shared with the TUI.
5. Use **code-server** as the GUI launch/test harness; `@vscode/test-web`
   notes are historical. Keep the `browser` entry for vscode.dev.
6. Do **not** add `@vscode/webview-ui-toolkit`; it is archived/deprecated.
7. Reuse VS Code's theme tokens. Use `@vscode-elements/elements` for
   text fields/dropdowns and native buttons with `--vscode-button-*`.

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
