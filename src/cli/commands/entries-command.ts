import { Command, Flags } from "@oclif/core";
import { resolve } from "node:path";

import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";
import { fetchRootCandidates } from "../../lib/graph/roots.ts";
import { resolveProject } from "../lib/project.ts";
import { writeRootsCache } from "../lib/roots-cache.ts";

export default class EntriesCommand extends Command {
  static summary = "List project root symbols for entry pickers/completion";
  static description =
    "Query cbm's repository map and print a finite root-symbol list: entry points, modules and exported classes. Use --write-cache to update roots.json.";
  static examples = [
    "<%= config.bin %> entries --project graph-ui-svelte",
    "<%= config.bin %> entries --project graph-ui-svelte --json --write-cache",
  ];
  static flags = {
    backend: Flags.string({
      char: "b",
      options: ["cbm", "scip"],
      default: "cbm",
      description: "graph backend",
    }),
    root: Flags.string({ description: "workspace root", default: process.cwd() }),
    project: Flags.string({ description: "project name (default: workspace basename)" }),
    cbm: Flags.string({ description: "explicit local cbm base URL" }),
    limit: Flags.integer({ default: 50, min: 1, description: "maximum candidates" }),
    json: Flags.boolean({ description: "print JSON" }),
    "write-cache": Flags.boolean({
      description: "write .codebase-memory/code-graph/roots.json",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(EntriesCommand);
    const root = resolve(flags.root);
    const backend = flags.backend as "cbm" | "scip";
    const project = await resolveProject(root, backend, flags.project);
    const endpoint = await resolveCbmBaseUrl(flags.cbm);
    const candidates = await fetchRootCandidates(
      endpoint.baseUrl,
      project.project,
      flags.limit,
    );

    if (flags["write-cache"]) {
      const path = writeRootsCache(root, project.project, candidates);
      if (!flags.json) console.error(`Wrote ${path}`);
    }

    if (flags.json) {
      this.log(JSON.stringify(candidates, null, 2));
      return;
    }
    if (candidates.length === 0) {
      this.log("no root candidates");
      return;
    }
    for (const candidate of candidates) {
      const location = candidate.filePath
        ? `${candidate.filePath}:${candidate.startLine}`
        : "(no file)";
      this.log(`${candidate.qualifiedName}\t${location}\t${candidate.reason}`);
    }
  }
}
