# JSON-safe UI state

`codeGraph` is the single low-frequency UI state object used by the web and
VS Code webview shells.

```ts
codeGraph.setup.source;       // computed | cbm
codeGraph.setup.project;
codeGraph.setup.entry;
codeGraph.setup.configPath;
codeGraph.setup.nodeRendererPath;
codeGraph.current.graph;      // GraphViewData | null
codeGraph.current.selection;  // { id, node }
codeGraph.current.view;       // depth, direction, layout, renderer, focusOnly
codeGraph.current.load;       // progress + symbol/graph/layout flags
```

## Contract

- Every field is JSON-safe: no DOM nodes, D3 transforms, timers, functions or
  Maps/Sets. `JSON.stringify(codeGraph)` must round-trip without a custom
  serializer. `tests/state.test.ts` guards this.
- Only low-frequency data belongs here. A value that changes every animation
  frame (zoom, pan, pointer position, ELK layout geometry) stays local to the
  renderer.
- `src/lib/state/progress.ts` owns the 250 ms ETA timer and writes only
  `current.load.progress`; the state object itself has no timers.
- `src/lib/state/url-sync.ts` translates between query params and the state
  object. URL state remains the shareable subset; `focusOnly` is local UI state.
- `src/lib/node-renderer.ts` defines the JSON-safe node context; the renderer
  path lives in `setup` so it can be snapshotted.

## Debugging

In every host, `window.codeGraph` points at the same reactive object, so the
webview devtools can inspect it too:

```js
copy(JSON.stringify(codeGraph, null, 2));
```

Components read state through the object rather than through a parallel set of
local variables, so a future save/restore feature can reuse the same JSON
shape.
