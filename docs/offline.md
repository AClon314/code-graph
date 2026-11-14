# Offline mode

Offline mode is for large repositories. The expensive stages — repository
indexing, graph BFS, SCIP import, ELK layout, terminal frame construction — are
computed ahead of time and consumed as an artifact later. The runtime viewer
should only paint and navigate that artifact.

This boundary keeps the door open for other workflows that need the same
precomputed result, for example:

- headless rendering or tests;
- a three.js/WebGL animation of the graph;
- sharing a graph snapshot without access to the original cbm server;
- embedding a static graph in docs or a dashboard.

## Current state

- The TUI already consumes a precomputed frame:
  `<workspace>/.codebase-memory/code-graph/<backend>/frame.json`.
  A frame contains SCIP-derived graph data plus ELK layout/terminal geometry.
- The GUI currently loads live cbm data, or the bundled `computed` sample. It
  does not yet pick an offline artifact from disk.
- `project` in cbm mode is a database key, not a filesystem path.

A future GUI offline loader should choose a concrete format first. A
`GraphViewData` JSON file has edges and is directly usable by the GUI (ELK can
be recomputed); a precomputed layout can be serialized alongside it. A TUI
frame is already laid out but does not carry the full edge list the GUI
inspector needs, so it would need a dedicated frame viewer instead.

No offline format or file picker is implemented yet.
