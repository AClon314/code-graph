import { Command } from "@oclif/core";
import { resolve } from "node:path";

import { graphFlags, indexTuningFlags } from "../lib/flags.ts";
import { runIndex } from "../lib/indexer.ts";
import { renderResolved, resolveOutputMode } from "../lib/output.ts";
import { resolveProject } from "../lib/project.ts";

export default class GraphCommand extends Command {
  static summary = "One-click index + SVG/orchgraph render";
  static description =
    "Index the workspace (unless --graph is supplied), then render the same graph model used by the GUI and TUI.";
  static examples = [
    "<%= config.bin %> graph --backend cbm",
    "<%= config.bin %> graph --backend scip --project my-project --format both",
    "<%= config.bin %> graph --graph tui/fixture-graph.json --format svg",
  ];
  static flags = { ...graphFlags, ...indexTuningFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(GraphCommand);
    const root = resolve(flags.root);
    const backend = flags.backend as "cbm" | "scip";
    const cbm = await resolveProject(root, "cbm", flags.project);
    const scip = await resolveProject(root, "scip", flags["scip-project"]);

    if (!flags.graph) {
      const code = runIndex({
        backend,
        root,
        project: cbm.project,
        scipProject: scip.project,
        mode: flags.mode as "fast" | "moderate" | "full",
        cbmBin: flags["cbm-bin"],
        bunBin: flags.bun,
        nodeBin: flags.node,
        scipIndexer: flags["scip-indexer"],
        writerDir: flags.writer,
        scipOutput: flags["scip-output"],
        cacheDir: flags["cache-dir"],
      });
      if (code !== 0) this.exit(code);
    }

    const mode = resolveOutputMode(flags.format);
    if (mode.stream && flags.out) {
      console.error("stdout is piped; ignoring --out");
    }

    const result = await renderResolved({
      root,
      backend,
      project: cbm.project,
      scipProject: scip.project,
      cbm: flags.cbm,
      symbolEntry: flags["symbol-entry"],
      graph: flags.graph,
      depth: flags.depth as 1 | 2 | 3,
      direction: flags.direction as "both" | "callers" | "callees",
      maxNodes: flags["max-nodes"],
      format: mode.format,
      out: flags.out,
      stream: mode.stream,
      layoutDirection: flags["layout-direction"] as "DOWN" | "UP" | "LEFT" | "RIGHT",
      spacing: flags.spacing,
      maxNodeWidth: flags["max-node-width"],
    });

    console.error(
      `Rendered ${result.nodes} nodes / ${result.edges} edges` +
        (result.truncated ? " (truncated)" : ""),
    );
    if (result.stdout !== undefined) {
      process.stdout.write(result.stdout);
    } else {
      for (const path of result.files) console.error(`Wrote ${path}`);
    }
  }
}
