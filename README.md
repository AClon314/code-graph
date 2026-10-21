# code-graph

Svelte 5 shell for the generic code navigator. **B2** of `../../tmp/TODO.md`:
the graph source contract, a demo shell, and a local call-graph navigator
(tree → symbol bundle → 1–3 hop graph → jump to Fresh/VSCode). The CodeMirror
reader (B1) is cancelled; this GUI navigates but does not edit code.

> cbm's React UI is **not replaced** yet. This is a separate, opt-in shell
> mounted inside the cbm fork at `rules/cbm/graph-ui-svelte/`; the repository
> is `code-graph`. Only **Call Graph** is Svelte; the other workspace tabs link
> back to the stable React graph-ui (`?workspace=…`).

Default mode is `MockSource`, so the UI runs before a daemon exists. Switch to
`cbm HTTP` to read a DB written by `scip-cbm-writer` through codebase-memory-mcp.

The GUI does not embed an editor. **Jump** sends a target to the small HTTP
bridge; start it in another terminal:

```bash
bun run jump:bridge
# Fresh adapter: fresh-plugin/ (poll /jump/next?client=fresh)
# VSCode adapter: extensions/vscode/ (poll /jump/next?client=vscode)
```

## Run

```bash
bun install
bun run dev
# local: http://127.0.0.1:5173
# remote/LAN: http://<host-ip>:5173 (Vite binds 0.0.0.0)
```

For a real graph:

```bash
# 1. write a cbm DB from a .scip index (inside the cbm fork)
(cd ../tools/scip-cbm-writer && bun run src/cli.ts /path/to/index.scip \
  --project fixture-hard-scip \
  --root ../dev/fixtures/callgraph-ts-hard \
  --cache-dir /tmp/cbm-cache-scip)

# 2. start cbm's HTTP API against that cache (keep stdin open)
CBM_CACHE_DIR=/tmp/cbm-cache-scip ../../cbm-runtime/node_modules/.bin/codebase-memory-mcp \
  --ui=true --port=9751

# 3. point Vite's /api proxy at it
CBM_HTTP=http://127.0.0.1:9751 bun run dev
```

Then click **cbm HTTP**; project `fixture-hard-scip`, symbol
`fixture-hard-scip.src.features.useAlias`.

The repository is named **`code-graph`** but the mount path inside the cbm fork
is **`graph-ui-svelte/`** (cbm-facing name).

## Hybrid rollout

| Surface | Owner |
|---|---|
| Call Graph | Svelte (`code-graph`) |
| Explore / Galaxy / Architecture / ADR / Agents / Coverage / System | React graph-ui |

`src/lib/navigation.ts` builds `/?workspace=<id>` links. `VITE_REACT_UI` selects the React origin (`same-origin` when served by cbm,
or a full URL/path when behind a proxy). By default it uses the current
hostname plus `VITE_REACT_PORT` (9749), never a hard-coded host.

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
bun test          # GraphSource, neighborhood BFS, ELK layout
bun run check     # svelte-check
bun run build     # production bundle
```

## Scope

- B0: shell, contract, Mock/Cbm sources, tree/symbol panel, mobile layout.
- B1: cancelled (no CodeMirror / editor surface).
- B2: ELK-layered local call graph (depth/direction/search), symbol details,
  SVG export, and jump-to-editor via the shared bridge.
- B3: VSCode/Fresh jump adapters (shared bridge); optional LSP later.
