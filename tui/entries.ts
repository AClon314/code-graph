#!/usr/bin/env bun
/**
 * List explicit entry-point candidates for a cbm project.
 *
 *   bun run tui/entries.ts --project fixture-hard-scip
 *   bun run tui/entries.ts --cbm http://127.0.0.1:9751 --project p --json
 *
 * This is a candidate list, not an inference of "the" entry. cbm's
 * is_entry_point is heuristic; Java/Python may have several valid entries.
 */
import { parseArgs } from "node:util";

import { entryCandidates, type RepositoryNode } from "../src/lib/graph/entries.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cbm: { type: "string" },
    project: { type: "string" },
    json: { type: "boolean" },
    limit: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`Usage: bun run tui/entries.ts --project <name> [options]

Options:
  --cbm <url>       cbm HTTP base (default: CBM_HTTP or http://127.0.0.1:9749)
  --project <name>  cbm project name
  --limit <n>       maximum candidates (default: 20)
  --json            print JSON
  -h, --help        show this help`);
  process.exit(0);
}

if (!values.project) {
  console.error("entries: --project is required");
  process.exit(2);
}

const base = (values.cbm || process.env.CBM_HTTP || "http://127.0.0.1:9749").replace(
  /\/+$/,
  "",
);
const limit = Number(values.limit ?? "20");
if (!Number.isInteger(limit) || limit < 0) {
  console.error("entries: --limit must be a non-negative integer");
  process.exit(2);
}

const url = new URL(`${base}/api/repository-map`);
url.searchParams.set("project", values.project);

let payload: { nodes?: RepositoryNode[] };
try {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`entries: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  payload = (await response.json()) as { nodes?: RepositoryNode[] };
} catch (cause) {
  console.error(`entries: cannot query ${url}: ${String(cause)}`);
  process.exit(1);
}

const candidates = entryCandidates(payload.nodes ?? [], limit);
if (values.json) {
  console.log(JSON.stringify(candidates, null, 2));
} else if (candidates.length === 0) {
  console.log("no entry candidates (cbm's is_entry_point is heuristic)");
} else {
  for (const candidate of candidates) {
    const location = candidate.filePath
      ? `${candidate.filePath}:${candidate.startLine}`
      : "(no file)";
    console.log(`${candidate.qualifiedName}\t${location}\t${candidate.reason}`);
  }
}
