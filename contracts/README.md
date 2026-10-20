# GraphSource contract

Version: **1** (`graph-source.v1.json`). The TypeScript source of truth is
`../src/lib/graph/types.ts`; this directory is for non-TS consumers (editor
extensions, CLI, future LSP) and for pinning response shapes.

## Methods

| Method | cbm HTTP | Notes |
|---|---|---|
| `projects()` | — | UI is project-scoped; returns the configured project |
| `tree(project, path?)` | `/api/tree` | directory wins over cbm's same-named file node |
| `symbol(project, qnOrId)` | `/api/symbol?qn=` / `?id=` | returns node + callers/callees |
| `trace(project, from, to, mode?)` | `/api/trace` | A→B path; not the MCP `trace_path` tree |
| `impact(project, node)` | `/api/impact` | reverse reachability |
| `source(...)` | A2 | not available in cbm 0.12.1 |
| `search(...)` | A2/MCP | not available in cbm 0.12.1 |

`contracts.test.ts` lives in `test/` and exercises both `MockSource` and
`CbmHttpSource` against these shapes.
