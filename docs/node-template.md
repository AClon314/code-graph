# Node templates

`slot-node.html` is a workspace fragment that controls the content and layout
of D3 node cards. It is read by the host and rendered inside an SVG
`<foreignObject>`; the card border, selection glow and pointer handling stay in
the graph shell.

## Why slot-html (and not SVG)

The graph is already SVG, but a raw SVG template would require users to manage
coordinates, clipping and text metrics. A small HTML fragment gives normal
layout (`flex`, `grid`, line clamping) while the shell keeps layout geometry and
export working. The trade-off is that external SVG viewers that do not support
`foreignObject` will show only the card shell; the browser and the in-app SVG
export support it. The headless CLI SVG path keeps its text renderer.

Fresh/TUI uses a separate `slot-node.ts` because the terminal renderer cannot
consume HTML. Its default export is a function with a local `FreshNodeContext`
type; return plain text, where the first line is the node label and following
lines are the detail block. It is loaded by `tui/render.ts` from the workspace
root (or `node.freshTemplate`), so edits are picked up on the next `r` reload.
If the file is absent, Fresh falls back to the built-in text rendering.

## Root element and `<template>`

The fragment is inserted as the content of an SVG `foreignObject`, so its root
must be a rendered element, usually a `<div>`. It is not an HTML
`<template>` document: `<template>` content lives in an inert
`DocumentFragment`, is not painted by the browser, and would leave the node
card empty. If a `<template>` root were desired, the renderer would have to
clone `template.content` into a visible host first; the final visible root
would still be an ordinary element. Keeping the root a `<div>` avoids that
extra step and gives the card a real layout box. (The `<slot>` elements are a
small custom placeholder syntax, not Web Components shadow-DOM slots.)

## No inline JavaScript

Slots are intentionally declarative: the renderer only substitutes escaped
values. Svelte's `{@html}` does not run `<script>` elements inserted through
`innerHTML`, and there is no expression evaluator, so `{{ ... }}` or inline
`<script>` logic will not work. Inline event attributes are also not a
supported API; host CSP rules differ, and raw `{@html}` content is not
sanitized beyond slot values.

Safe alternatives, in increasing order of complexity:

- CSS-only states: add classes/data attributes to the node wrapper (kind,
  entry/test/exported, selection) and target them from template CSS.
- Per-kind templates: choose a template by `node.label` / `node.kind` instead
  of branching inside one string (currently all nodes share one template).
- Declarative directives: add a small, documented set such as
  `data-when="node.isEntry"` or format helpers, implemented by the renderer
  rather than evaluated as JavaScript.
- Host function templates: a module/function template (like the Fresh
  `slot-node.ts`) that receives the node context and returns HTML/text. This
  needs an explicit loading, CSP and trust model for the web/VSCode hosts.
- Sandboxed iframe: only if arbitrary user JavaScript is a hard requirement;
  it is expensive per node and breaks simple layout/export assumptions.

## Slot syntax

Slots are dot paths. The renderer walks the context object, so nested paths work
without flattening:

```html
<span><slot name="node.label">kind</slot></span>
<strong><slot name="node.name">name</slot></strong>
<span><slot name="node.shortName">…</slot></span>
```

Available paths are listed in `NODE_TEMPLATE_SLOT_PATHS` and in the template
header. The important ones:

```text
node.id, node.symbolId, node.name, node.label, node.qualifiedName,
node.shortName, node.filePath, node.fileTail, node.startLine,
node.startColumn, node.endLine, node.docstring, node.isEntry,
node.isTest, node.isExported,
graph.root, graph.project, graph.nodeCount, graph.edgeCount, project
```

Slot values are HTML-escaped. Fallback content is kept when a path is missing
or empty. The syntax intentionally does not support nested `<slot>` elements.

## Type hints

HTML has no import statements, so TypeScript declarations cannot be attached to
the file. The portable fallback is the comment header at the top of
`slot-node.html`. The standalone input route additionally:

- lists every slot path in a sidebar;
- offers CodeMirror completion after `<slot name="`;
- uses HTML highlighting for `.html` and JSON highlighting for `.json`.

VSCode and Fresh open the same file with their native editor; they show the
header comment but do not currently run a custom HTML completion provider. If
that becomes necessary, the slot list can be generated from
`NODE_TEMPLATE_SLOT_PATHS` into a language-server/schema file without changing
the template format.

## Fresh text template

```ts
export default function slotNode({ node }: FreshNodeContext): string {
  return `${node.name}\n${node.filePath ?? node.shortName}:${node.startLine ?? 1}`;
}
```

The file is self-contained; no package import is required, so the editor can
provide type hints from the local interface. The `freshTemplate` key in
`code-graph.config.jsonc` can point at another `.ts` file.

## CSS

The shell exposes:

```text
.code-graph-node-html
.node-template / .node-template-kind / .node-template-name / .node-template-path
```

Use the existing `--cg-*` variables for colors and typography, or override the
template classes in global CSS. `foreignObject` content is normal HTML, so a
user template can use inline styles or its own classes. The shell's
`.code-graph-node-card` remains behind the fragment and supplies the border and
selection glow.

## Config links

`Setup` contains links to `code-graph.config.jsonc` and `slot-node.html`:

- VSCode: opens the file in the active workspace editor.
- Fresh: `Config` opens `code-graph.config.jsonc`; `Template` opens
  `slot-node.ts` (creates it from the built-in template if missing) and falls
  back to `slot-node.html` in read-only workspaces.
- Web: opens `/input?path=<relative_path>` in a new tab. The route editor
  supports copy/download; persisting edits is left to the host/workspace.
- Webview: goes through `ExtensionApi.openLocation` and opens the file in the
  VSCode host.
