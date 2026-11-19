# Node renderer

`renderNode.config.mjs` is a workspace module shared by the web, VS Code and
Fresh shells. It exports two named functions; there is no default export:

```js
// @ts-check

/** @typedef {import("./src/lib/node-renderer.ts").NodeRenderContext} NodeRenderContext */

/**
 * HTML used inside the D3 card's foreignObject.
 * @param {NodeRenderContext} context
 * @returns {string}
 */
export function renderNodeHtml({ node }) {
  return (
    '<div class="node-card">' +
    '<strong>' + node.name + '</strong>' +
    '</div>'
  );
}

/**
 * Plain text returned to the Fresh/TUI frame.
 * @param {NodeRenderContext} context
 * @returns {string}
 */
export function renderNodeText({ node }) {
  return node.name + "\n" + (node.filePath ?? node.shortName) + ":" + (node.startLine ?? 1);
}
```

The real file carries a self-contained JSDoc typedef so it also works when the
workspace is not the package root. `// @ts-check` enables editor checking in
VS Code and JetBrains; no `import` is required.

## Exports

```text
renderNodeHtml(context) -> string   web + VS Code webview HTML
renderNodeText(context) -> string   Fresh/TUI text
```

`renderNodeText` returns plain text: the first line becomes the node label,
following lines become the detail block. It is called before ELK measures the
node, so long output affects terminal layout.

`renderNodeHtml` returns raw HTML. Callers are responsible for escaping values
inside their own interpolation. The default implementation uses a local
`escapeHtml` helper.

## Why `.mjs`

The renderer is a module, not an HTML fragment. `.mjs` makes the file ESM in
every workspace, regardless of the nearest `package.json` `type` field:

- Vite / browser: served as a JavaScript module;
- VS Code extension host: resolved as ESM when creating a webview resource URL;
- Fresh/Bun: imported directly before rendering the terminal frame.

A `.js` file would depend on the workspace's package type and can silently be
treated as CommonJS in Node. `.ts`/`.tsx` would require a compiler in Web and
VS Code; the shared runtime format is `.mjs`.

## Host loading

- **Web**: the browser host exposes the file through
  `/api/config-file?path=renderNode.config.mjs` with a JavaScript MIME type.
  `App.svelte` dynamically imports that URL and calls `renderNodeHtml`.
- **VS Code**: the extension host turns the workspace file into a
  `vscode-webview-resource:` URI with
  `webview.asWebviewUri()`. The webview imports it; CSP already allows
  `script-src ${webview.cspSource}`. The workspace folder is included in
  `localResourceRoots`.
- **Fresh**: `tui/render.ts` imports the file and passes `renderNodeText` into
  `buildFrame`; the Fresh QuickJS plugin only paints the resulting JSON frame.

The HTML function is called once per visible node while Svelte renders the
card; the text function is called once per node before layout. Keep both
functions synchronous and free of DOM/network side effects.

## Root HTML element

The HTML is inserted inside an SVG `foreignObject`, so `renderNodeHtml` must
return at least one rendered element (normally a `<div>`). Do not wrap the
result in `<template>`: template content is inert and will not be painted.

## Type hints

The renderer file contains its own JSDoc typedefs, so it does not depend on the
package being installed. The standalone `/input?path=renderNode.config.mjs`
route provides JavaScript highlighting, copy/download and a read-only view of
the same file. VSCode and Fresh open it with their native editor.

## Security

The module executes with the host's privileges:

- browser: page privileges;
- VS Code webview: webview sandbox privileges;
- Fresh: Bun process privileges.

Treat `renderNode.config.mjs` as trusted workspace code. The HTML return value
is inserted with Svelte `{@html}`, so escape dynamic values yourself.

## Config links

Setup contains links to `code-graph.config.jsonc` and
`renderNode.config.mjs`:

- VSCode: opens the file in the active workspace editor.
- Fresh: `Config` opens JSONC; `Render` opens the renderer and creates it from
  the built-in default if missing.
- Web: opens `/input?path=<relative_path>` in a new tab.
- Webview: goes through `ExtensionApi.openLocation`.
