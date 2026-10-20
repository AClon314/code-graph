# code-graph

Svelte 5 shell for the generic code navigator. **B0** of `../tmp/TODO.md`:
the graph source contract + a demo shell; CodeMirror reader and 2D graph are
B1/B2.

Default mode is `MockSource`, so the UI runs before a daemon exists. Switch to
`cbm HTTP` to read a DB written by `scip-cbm-writer` through codebase-memory-mcp.

## Run

```bash
bun install
bun run dev
# http://127.0.0.1:5173
```

For a real graph:

```bash
# 1. write a cbm DB from a .scip index (see ../scip-cbm-writer)
(cd ../scip-cbm-writer && bun run src/cli.ts /path/to/index.scip \
  --project fixture-hard-scip \
  --root ../peers/fixtures/callgraph-ts-hard \
  --cache-dir /tmp/cbm-cache-scip)

# 2. start cbm's HTTP API against that cache (keep stdin open)
CBM_CACHE_DIR=/tmp/cbm-cache-scip codebase-memory-mcp --ui=true --port=9751

# 3. point Vite's /api proxy at it
CBM_HTTP=http://127.0.0.1:9751 bun run dev
```

Then click **cbm HTTP**; project `fixture-hard-scip`, symbol
`fixture-hard-scip.src.features.useAlias`.

The repository is named **`code-graph`** but the mount path in the parent repo
is **`rules/graph-ui-svelte/`** (cbm-facing name).

## Contract

`src/lib/graph/types.ts` is the only interface the UI knows:

```ts
projects() / tree(project, path)
symbol(project, qnOrId)
trace(project, from, to, mode)
impact(project, node)
source(project, path, start?, end?)
search(project, query, limit?)
```

- `CbmHttpSource` maps `/api/tree`, `/api/symbol`, `/api/trace`, `/api/impact`.
- `MockSource` is deterministic and used by tests.
- `source`/`search` fail loud: cbm 0.12.1 has no `/api/source` or `/api/search`
  (A2 adds source; B2 can add search).

## Endpoint mapping

| GraphSource | cbm HTTP |
|---|---|
| `tree` | `/api/tree?project=&path=` |
| `symbol` | `/api/symbol?project=&qn=` or `&id=` |
| `trace` | `/api/trace?project=&from=&to=&mode=` |
| `impact` | `/api/impact?project=&node=` |
| `source` | A2 |
| `search` | A2 / MCP |

`/api/tree` groups by `nodes.file_path`, so a Folder node also appears as a
same-named "file"; `CbmHttpSource` merges those with directory priority.

## Commands

```bash
bun test          # GraphSource contract + HTTP mapping
bun run check     # svelte-check
bun run build     # production bundle
```

## Scope

- B0: shell, contract, Mock/Cbm sources, tree/symbol panel, mobile layout.
- B1: CodeMirror 6 reader (`EditorPort`).
- B2: 2D call graph + trace/impact panels.
- B3: LSP/VSCode/fresh adapters (shared contract).
