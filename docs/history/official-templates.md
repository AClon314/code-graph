# Official VS Code extension templates and samples

> Research date: 2026-10. Scope: what Microsoft officially ships for scaffolding and
> testing VS Code extensions, and what it means for code-graph's new GUI.

## TL;DR

- There is **no official Microsoft repository named `vscode-extension-template`**.
  The official scaffold is the Yeoman generator [`microsoft/vscode-generator-code`](https://github.com/microsoft/vscode-generator-code)
  (`yo code`), and the official reference code is
  [`microsoft/vscode-extension-samples`](https://github.com/microsoft/vscode-extension-samples).
- For a GUI that runs inside VS Code for the Web, generate **New Web Extension (TypeScript)**
  (`ext-command-web`), which uses a `browser` entry point and a webworker-safe bundle.
- Microsoft has **no official Svelte template**. Svelte is still viable because the UI runs
  in a normal webview (an iframe); see [`webview-svelte.md`](./webview-svelte.md).
- Test the web extension with [`@vscode/test-web`](https://github.com/microsoft/vscode-test-web),
  the official local VS Code for the Web harness. See [`vscode-web-testing.md`](./vscode-web-testing.md).
- `@vscode/webview-ui-toolkit` is archived/deprecated (deprecation announced for 2025-01-01).
  Do not start a new project on it. `vscode-elements/elements` is an active, framework-neutral
  web-component alternative, but it is community-maintained, not an official Microsoft template.

## `yo code` templates

Install and run:

```bash
npm install -g yo generator-code
yo code
```

Templates currently shipped by `generator-code` (see `generators/app/`):

| Template | Generator id | Runtime | Use for |
|---|---|---|---|
| New Extension (TypeScript) | `ext-command-ts` | Node extension host | Desktop extensions |
| New Extension (JavaScript) | `ext-command-js` | Node extension host | Desktop extensions |
| New Web Extension (TypeScript) | `ext-command-web` | Browser webworker extension host | vscode.dev / `@vscode/test-web` |
| New Color Theme | `ext-colortheme` | Declarative | Themes |
| New Language Support | `ext-language` | Declarative | Grammars / language configuration |
| New Code Snippets | `ext-snippets` | Declarative | Snippets |
| New Keymap | `ext-keymap` | Declarative | Keybindings |
| New Extension Pack | `ext-extensionpack` | Declarative | Extension bundles |
| New Language Pack | `ext-localization` | Declarative / runtime | Localization |
| New Notebook Renderer | `ext-notebook-renderer` | Webview-like | Notebook output renderers |

The CLI also supports quick generation:

```bash
yo code MyGraph -t=ts -q
yo code MyWebGraph -t=web -q
```

`ext-command-web` writes:

```text
src/web/extension.ts          # extension entry, exported activate/deactivate
src/web/test/suite/           # web extension tests
.vscode/launch.json           # "Run Web Extension" / test launch configs
.vscode/tasks.json            # watch-web problem matcher
webpack.config.js             # or esbuild.js
package.json                  # "browser": "./dist/web/extension.js"
tsconfig.json                 # lib: webworker
```

Important manifest detail: a web extension uses `browser`, not `main`:

```json
{
  "engines": { "vscode": "^1.74.0" },
  "browser": "./dist/web/extension.js",
  "contributes": {
    "commands": [
      { "command": "codeGraph.show", "title": "Code Graph: Show" }
    ]
  }
}
```

If the extension also needs a desktop/Node entry point, keep both `main` and `browser`.
The web extension host only loads the `browser` bundle. It cannot use Node APIs, child
processes, or arbitrary module loading; use `vscode.workspace.fs` and `fetch` instead.

## Official samples worth reading

Repository: <https://github.com/microsoft/vscode-extension-samples>

| Sample | Why it matters for code-graph |
|---|---|
| [`helloworld-web-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/helloworld-web-sample) | Smallest web extension; `browser` entry plus webpack webworker config. |
| [`webview-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample) | Canonical `createWebviewPanel`, `asWebviewUri`, CSP, message passing. |
| [`webview-view-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample) | Webview in a sidebar/panel view (`WebviewViewProvider`) instead of an editor tab. |
| [`tree-view-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample) | Native `TreeView` / `TreeDataProvider`; the right replacement for a hand-drawn file tree. |
| [`lsp-web-extension-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-web-extension-sample) | Language server in a web extension (worker), if code-graph needs language features. |
| [`webpack-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/webpack-sample) | Bundling a single-file `browser` entry. |
| [`webview-codicons-sample`](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-codicons-sample) | Using VS Code codicons inside a webview. |

The repo also has a `.base-sample` directory with shared build scripts. It is a sample
repository, not a project template you should copy wholesale.

There is also [`microsoft/vscode-python-tools-extension-template`](https://github.com/microsoft/vscode-python-tools-extension-template),
an official template for Python tooling extensions. It is useful as a reference for
release/CI layout, but it is not a webview or web-extension template.

## Webview UI component options

- **No framework / plain DOM**: what most official samples use. Lowest dependency cost,
  but you own rendering and state.
- **Svelte**: supported in practice, because a webview is just HTML/CSS/JS. No official
  template, but no API obstacle. Recommended for code-graph if the team already knows Svelte.
- **React**: common in community extensions; official `webview-ui-toolkit` was React-friendly
  but is deprecated.
- **`@vscode/webview-ui-toolkit`**: archived. It shipped web components (so it *did* work
  with Svelte/Vue too), but it is no longer maintained. Avoid for a new project.
  Deprecation issue: <https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561>
- **`@vscode-elements/elements`**: community Lit web components that follow VS Code styling.
  Framework-neutral, can be consumed from Svelte. Not an official Microsoft project:
  <https://github.com/vscode-elements/elements>
  This repo uses it for `vscode-textfield` / `vscode-single-select`; buttons stay
  native `<button>` with `--vscode-button-*` so keyboard and ARIA behavior is
  browser-native.

For a graph/canvas-heavy UI, hand-rolled SVG/canvas plus VS Code CSS variables is often
better than a component kit anyway.

## Official guidance that shapes our design

From <https://code.visualstudio.com/api/extension-guides/webview>:

- Use webviews sparingly. Native APIs (`TreeView`, editor commands, decorations, diagnostics)
  should carry as much of the UX as possible.
- A webview is isolated. Local assets must go through `webview.asWebviewUri`; scripts need
  `enableScripts: true` and a restrictive CSP.
- Webview state is destroyed when the tab is hidden. Make the webview stateless and persist
  through `postMessage` / `getState`/`setState`.
- `retainContextWhenHidden` is a memory-heavy escape hatch, not the default architecture.
- Never interpolate workspace paths or file contents into HTML without escaping; prefer a
  small HTML builder and a strict CSP.

## Recommendation for code-graph

1. Start from `yo code` **New Web Extension (TypeScript)** (`ext-command-web`) or copy
   `helloworld-web-sample`. Do **not** start from the old Svelte app shell.
2. Keep the extension host browser-safe (`browser` entry). If desktop-only features are
   needed later, add a `main` entry and share the graph core.
3. Build the graph UI as a webview with Vite + Svelte. Use native Explorer / `TreeView`
   for files; do not reimplement a file tree in the webview.
4. Use `@vscode/test-web` to launch VS Code for the Web with the extension loaded. The
   old Svelte `vite dev` flow is replaced by this command for GUI testing.
5. Keep the Fresh/TUI path independent. TUI consumes the same graph data/protocol but does
   not depend on VS Code APIs or webview code.
