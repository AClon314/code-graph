#!/usr/bin/env bun
/**
 * List explicit entry-point candidates for a cbm project.
 *
 *   bun run tui/entries.ts --project fixture-hard-scip
 *   bun run tui/entries.ts --project p --json
 *
 * This is a candidate list, not an inference of "the" entry. cbm's
 * is_entry_point is heuristic; Java/Python may have several valid entries.
 */
import { parseArgs } from "node:util";

import { fetchEntryCandidates } from "../src/lib/graph/entries.ts";
import { resolveCbmBaseUrl } from "../src/lib/cbm-discovery.ts";

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
  --cbm <url>       explicit local cbm base (testing only)
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

const endpoint = await resolveCbmBaseUrl(values.cbm);
const base = endpoint.baseUrl;
const limit = Number(values.limit ?? "20");
if (!Number.isInteger(limit) || limit < 0) {
  console.error("entries: --limit must be a non-negative integer");
  process.exit(2);
}

let candidates;
try {
  candidates = await fetchEntryCandidates(base, values.project, limit);
} catch (cause) {
  console.error(`entries: ${String(cause)} (project=${values.project})`);
  process.exit(1);
}

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
