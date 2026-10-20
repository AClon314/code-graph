# fresh-plugin (QuickJS)

Reserved home for the Fresh plugin. Rules:

- Runs inside Fresh's QuickJS sandbox: **no npm imports, no Node, no DOM**.
- Reads the precomputed frame JSON from `../tui/` (layout happens in Bun).
- Only `editor.*` calls + span/overlay painting; no graph layout here.
- `tmp/fresh/orch-graph.ts` is the prototype this directory replaces.
