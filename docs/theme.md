# Theme and DPI scale

The web/code shell uses one palette in `src/theme.css`. It follows the same
three-state model as the parent `gpen-js` project:

- every theme-dependent token is declared once with `light-dark(light, dark)`;
- `color-scheme` selects the branch;
- `data-code-graph-theme="light|dark"` on the root pins a manual theme;
- there is no `@media (prefers-color-scheme: dark)` override, so a manual
  choice cannot be pushed back by the OS preference.

## Host tokens

In the VS Code/code-server webview, real `--vscode-*` tokens win. The
`light-dark()` values are only fallbacks. The standalone web build (`mode=web`
or `vite dev`) sets `data-code-graph-standalone` and also supplies a small set
of `--vscode-*` fallbacks so native controls render in the same light/dark
palette.

## DPI scale

Third-party hosts control the entire shell with one CSS variable:

```css
:root {
  --code-graph-scale: 1.5;
}
```

`--code-graph-zoom` clamps it to `0.25..4` and is applied as CSS `zoom` on the
app shell. Percentage sizes resolve in local pixels, so the app still fills the
visual viewport. The graph fit logic deliberately uses `clientWidth` /
`clientHeight` (local px), not `getBoundingClientRect()` (visual px), so DPI
scaling does not make the graph shrink twice.

If the app is loaded in an iframe and the outer page cannot write the inner
document's CSS variables, use the query aliases:

```text
https://code-graph.example/?scale=1.5&theme=dark
```

`scale` sets `--code-graph-scale`; `theme` sets `data-code-graph-theme`. The
embed params are preserved when the graph updates its own URL state.

## Token groups

| Group | Examples |
|---|---|
| Typography | `--cg-font-sans`, `--cg-font-mono`, `--cg-font-size` |
| Shell | `--cg-bg`, `--cg-panel`, `--cg-line` |
| Content | `--cg-text`, `--cg-muted`, `--cg-accent` |
| Graph | `--cg-graph-bg`, `--cg-node-bg`, `--cg-node-line`, `--cg-edge`, `--cg-hit` |
| Selection | `--cg-selection`, `--cg-selection-glow`, `--cg-selection-glow-opacity`, `--cg-selection-glow-blur`, `--cg-unrelated-opacity` |
| Graph geometry | `--cg-node-radius`, `--cg-node-label-size`, `--cg-node-detail-size`, `--cg-edge-width`, `--cg-edge-strong-width` |

Dark fallbacks are OLED-first: the page/graph canvas is `#000000`, panels and
node cards are slightly lifted (`#050505` / `#0a0a0a`), and text/accents use
higher contrast than the old `#1e1e1e` palette. A VS Code host still wins via
its real `--vscode-*` tokens.

## Third-party graph styling

The SVG renderer emits stable hooks in addition to the legacy
`orchgraph-*` names:

```text
.code-graph-view
.code-graph-node / .code-graph-node-card / .code-graph-node-glow
.code-graph-node-label / -detail / -kind
.code-graph-edge
.code-graph-node-html / .node-template / .node-template-name / .node-template-path
.is-selected / .is-search-hit / .is-related / .is-unrelated
```

Prefer overriding the `--cg-*` variables above. `.is-related` keeps full
opacity; `.is-unrelated` uses `--cg-unrelated-opacity` for nodes outside the
selected node's call paths. The selected glow is a
separate rect behind `.code-graph-node-card`, so it never covers the node text
or border.

Components consume the compatibility aliases `--bg`, `--panel`, `--text`,
`--graph-bg`, etc., which are bound to `--cg-*` in `src/app.css`. Change the
`--cg-*` token, not individual components.
