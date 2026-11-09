#!/usr/bin/env bun
/**
 * List root symbols for a cbm project: entry points, modules and classes.
 *
 *   bun run tui/entries.ts --project fixture-hard-scip
 *   bun run tui/entries.ts --project p --json --write-cache
 *
 * The list is finite and intentionally not "every symbol": arbitrary QNs
 * remain valid. `--write-cache` updates .codebase-memory/code-graph/roots.json
 * so shell completion and the Fresh picker can read it synchronously.
 */
import { parseArgs } from "node:util";

import { formatRoots, loadProjectRoots } from "../src/lib/graph/roots-fetch.ts";
import { writeRootsCache } from "../src/cli/lib/roots-cache.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cbm: { type: "string" },
    project: { type: "string" },
    root: { type: "string" },
    json: { type: "boolean" },
    "write-cache": { type: "boolean" },
    limit: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`Usage: bun run tui/entries.ts --project <name> [options]

Options:
  --cbm <url>       explicit local cbm base (testing only)
  --project <name>  cbm/scip project name
  --root <path>     workspace root for roots.json (default: cwd)
  --limit <n>       maximum candidates (default: 50)
  --write-cache     update .codebase-memory/code-graph/roots.json
  --json            print JSON
  -h, --help        show this help`);
  process.exit(0);
}

if (!values.project) {
  console.error("entries: --project is required");
  process.exit(2);
}

const limit = Number(values.limit ?? "50");
if (!Number.isInteger(limit) || limit < 0) {
  console.error("entries: --limit must be a non-negative integer");
  process.exit(2);
}

let candidates;
try {
  candidates = await loadProjectRoots(values.project, { cbm: values.cbm, limit });
} catch (cause) {
  console.error(`entries: ${String(cause)} (project=${values.project})`);
  process.exit(1);
}

if (values["write-cache"]) {
  const root = values.root ?? process.cwd();
  try {
    const path = writeRootsCache(root, values.project, candidates);
    if (!values.json) console.error(`entries: wrote ${path}`);
  } catch (cause) {
    console.error(`entries: cannot write roots cache: ${String(cause)}`);
    process.exit(1);
  }
}

if (values.json) {
  console.log(JSON.stringify(candidates, null, 2));
} else if (candidates.length === 0) {
  console.log("no root candidates (cbm's is_entry_point is heuristic)");
} else {
  console.log(formatRoots(candidates));
}
