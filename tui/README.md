# TUI / Fresh plugin home

Decision: **keep the TUI renderer and Fresh plugin in this repository**, as
sibling packages to the Svelte GUI. `code-graph` is the graph model + two
renderers, not only a browser app.

```
code-graph/
├── src/                 # Svelte GUI (browser)
├── contracts/           # GraphSource + frame shapes
├── tui/                 # Bun-side layout → styled cell frame
└── fresh-plugin/        # QuickJS plugin (no imports, no DOM)
```

Why not a separate repository yet:

- Fresh's plugin sandbox cannot import npm packages. The split is
  **outside Bun layout** vs **inside QuickJS paint**, not a separate product.
- The TUI frame and the GUI both need the same graph model, selection
  semantics, and `file:line` metadata; keeping them here prevents a third
  copy of the contract.
- `rules/tmp/fresh` already proves the flow: external `render-frame.ts` →
  JSON frame → virtual buffer spans. The port only replaces the prototype's
  `scip-graph` mock source with `GraphSource`/cbm data.

Port plan:

1. Move `render-frame.ts` / frame schema into `tui/` (Bun, may use elkjs or a
   small layered layout).
2. Keep `orch-graph.ts` as `fresh-plugin/` with only `editor.*` calls; it reads
   the precomputed frame JSON.
3. Point `export-gui.ts` at the same frame/model so TUI and GUI share selection
   and `file:line` jump targets.
4. Split into a separate repo only if the TUI grows its own release cadence or
   non-Fresh hosts (Textadept, etc.) become first-class.

The current prototype stays in `rules/tmp/fresh` until the port lands; it is
not imported by the GUI.
