# GraphSource contract

The TypeScript source of truth is `../src/lib/graph/types.ts`; this directory
is for non-TS consumers (editor extensions, CLI, future LSP) and for pinning
response shapes.

## Methods

`GraphSource` exposes a single method, used by the GUI/TUI neighborhood loader.

| Method | cbm HTTP | Notes |
|---|---|---|
| `symbol(project, qnOrId)` | `/api/symbol?qn=` / `?id=` | returns node + callers/callees |

The contract tests live in `test/` and exercise both `MockSource` and
`CbmHttpSource` against this shape.

## Jump protocol

The active jump contract is **v2 JSON-RPC 2.0** (`jump.v2.json`):

```text
POST /rpc  { "jsonrpc": "2.0", "id": 1, "method": "jump.open", "params": {...} }
GET  /health
```

`jump.v1.json` is the retired REST shape, kept for migration history. The
TypeSpec source is `code-nav.tsp`; regenerate the bundled JSON Schema with:

```bash
bun run contracts:compile
```

`generated/code-nav.schema.json` is checked in so the bridge and editor
extensions can validate params without running TypeSpec at runtime. Ajv turns
schema failures into JSON-RPC `-32602` errors with `instancePath`/`message`.
