# tui/ — Bun-side frame generator

The TUI path is deliberately split in two:

```
GraphViewData ──(Bun + orchgraph/ELK)──> frame JSON ──(QuickJS plugin)──> virtual buffer
```

Fresh plugins run in a QuickJS sandbox with **no npm imports**, so layout and
ANSI parsing happen here under Bun. `fresh-plugin/code-graph.ts` only reads the
frame and paints styled spans.

A **frame** is a static snapshot: layout, styled runs, click boxes and metadata
are already computed, so painting does not need cbm or ELK. `fixture-graph.json`
is only a hand-written sample input used for deterministic tests and the
installer; a frame generated from a real workspace with `--cbm` is just as
static at paint time.

## Files

| File | Purpose |
| --- | --- |
| `frame.ts` | GraphViewData → orchgraph `GraphDocument` → layout/render → `Frame` |
| `render.ts` | CLI for fixture files and live cbm data |
| `entries.ts` | List explicit entry-point candidates from a cbm project |
| `cache-link.ts` | Link a workspace frame into `~/.cache/code-graph/frames/` |
| `fixture-graph.json` | Deterministic 6-node fixture used by tests/install |
| `../fresh-plugin/code-graph.ts` | QuickJS consumer of the frame |

## Commands

```bash
export PATH="$HOME/.bun/bin:$PATH"

# The default --out is out/tui/frame.json.
# Deterministic fixture render (the test used by B4)
bun run tui/render.ts --graph tui/fixture-graph.json --out /tmp/code-graph-frame.json

# Live cbm: a small local BFS over /api/symbol callers/callees
bun run tui/render.ts \
  --cbm http://127.0.0.1:9749 \
  --project my-project \
  --symbol 'pkg.mod.fn' \
  --depth 2 --direction both \
  --max-nodes 60 \
  --out /tmp/code-graph-frame.json

# Optional layout knobs
bun run tui/render.ts --graph tui/fixture-graph.json \
  --layout-direction RIGHT --spacing 3 --max-node-width 32 \
  --out /tmp/code-graph-frame.json
```

The command prints one stats line:

```
wrote /tmp/code-graph-frame.json: 74x38, 6 nodes, 6 boxes,
38 lines (34 non-empty), 46 runs (6 colored, 1 bold), 6 meta entries, truncated=false
```

Output is deterministic: no `Date.now()`, no random IDs, and the same input
produces byte-identical JSON (`cmp` is a valid test).

## Frame contract

```ts
interface Frame {
  width: number;       // terminal cells
  height: number;      // number of rows (equals lines.length)
  nodeCount: number;   // graph nodes (not just boxes)
  lines: Run[][];      // one entry per canvas row; blank rows are []
  nodes: NodeBox[];    // click hit boxes
  meta: Record<string, NodeMeta>;
}

interface Run {
  t: string;           // ANSI-free text
  fg?: string;         // "#rrggbb" (SGR 30-37/90-97, 38;5;n, 38;2;r;g;b)
  bold?: boolean;      // SGR 1
}

interface NodeBox {
  id: string;
  x: number; y: number;        // 0-based cell coordinates
  width: number; height: number; // includes the box border
}

interface NodeMeta {
  label: string;       // graph node name (e.g. "useAlias")
  kind: string;        // cbm node kind (e.g. "Function")
  file: string;        // project-relative path ("" when unknown)
  line: number;        // 1-based start line (0 when unknown)
  qn: string;          // qualified name / stable graph id
}
```

Notes:

- ANSI is parsed, never forwarded. `t` is safe to feed to
  `setVirtualBufferContent`; `fg`/`bold` become span style.
- Trailing spaces on each row are trimmed, so overlay byte ranges stop at the
  visible text. Click columns still map into the original node boxes because
  boxes are stored in cell coordinates.
- `lines` is indexed by buffer row. The Fresh panel hides line numbers so row
  indices and node-box `y` values agree.
- The root node marker uses orchgraph's `running` theme (bold/yellow); other
  markers use `idle` with a fixed gray. That keeps at least one colored run in
  every non-empty frame without inventing graph state.
- Background colors are not part of the frame contract; the plugin paints its
  own selection background.

## Live cbm BFS

`render.ts --cbm` calls `CbmHttpSource.symbol(project, qnOrId)` and walks
callers/callees locally, keeping the TUI independent of the GUI's
`src/lib/graph/neighborhood.ts`. It keeps a node budget (`--max-nodes`),
deduplicates nodes by qualified name and edges by `source -> target : type`,
and never writes to `src/`. `truncated` is currently set only when the node
budget is hit.

## Known limitations

- No embedded code editor: selection opens `file:line` through Fresh's
  `openFile`; editing stays in Fresh's normal file buffers.
- Wide/CJK characters are treated as one cell in overlay math (the box-drawing
  frame itself is ASCII-width). The fixture and cbm identifiers are ASCII.
- No viewport paging: the whole frame is written to the virtual buffer.
  Very large graphs should be capped in `render.ts`.
- Layout requires ELK and therefore Bun/Node; `fresh-plugin/` must never layout.
- The frame reports only foreground color + bold. Dim/italic/underline and
  background SGR are stripped.
