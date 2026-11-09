import { Command } from "@oclif/core";

import { graphFlags } from "../lib/flags.ts";
import { renderResolved } from "../lib/output.ts";

export default class RenderCommand extends Command {
  static summary = "Render an existing graph to SVG and/or orchgraph text";
  static description =
    "Reads an existing cbm project (or a GraphViewData fixture) and writes the same graph the GUI/TUI render.";
  static examples = [
    "<%= config.bin %> render --project graph-ui-svelte --symbol-entry pkg.main",
    "<%= config.bin %> render --backend scip --format svg --out out/graph",
    "<%= config.bin %> render --graph tui/fixture-graph.json --format both",
  ];
  static flags = { ...graphFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(RenderCommand);
    const result = await renderResolved({
      root: flags.root,
      backend: flags.backend as "cbm" | "scip",
      project: flags.project,
      scipProject: flags["scip-project"],
      cbm: flags.cbm,
      symbolEntry: flags["symbol-entry"],
      graph: flags.graph,
      depth: flags.depth as 1 | 2 | 3,
      direction: flags.direction as "both" | "callers" | "callees",
      maxNodes: flags["max-nodes"],
      format: flags.format as "svg" | "orchgraph" | "both",
      out: flags.out,
      layoutDirection: flags["layout-direction"] as "DOWN" | "UP" | "LEFT" | "RIGHT",
      spacing: flags.spacing,
      maxNodeWidth: flags["max-node-width"],
    });

    this.log(
      `Rendered ${result.nodes} nodes / ${result.edges} edges` +
        (result.truncated ? " (truncated)" : ""),
    );
    for (const path of result.files) this.log(`Wrote ${path}`);
  }
}
