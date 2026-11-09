import { Command, Flags } from "@oclif/core";
import { resolve } from "node:path";

import { resolveProject } from "../lib/project.ts";
import { loadGraphData, renderGraph, type RenderFormat } from "../lib/render.ts";

export default class RenderCommand extends Command {
  static summary = "Render an existing graph to SVG and/or orchgraph text";
  static description =
    "Reads an existing cbm project (or a GraphViewData fixture) and writes the same graph the GUI/TUI render.";
  static examples = [
    "<%= config.bin %> render --project graph-ui-svelte --symbol-entry pkg.main",
    "<%= config.bin %> render --backend scip --format svg --out out/graph",
    "<%= config.bin %> render --graph tui/fixture-graph.json --format both",
  ];
  static flags = {
    backend: Flags.string({
      char: "b",
      options: ["cbm", "scip"],
      default: "cbm",
      description: "graph backend",
    }),
    root: Flags.string({ description: "workspace root", default: process.cwd() }),
    project: Flags.string({ description: "cbm-native project name" }),
    "scip-project": Flags.string({ description: "SCIP project name" }),
    cbm: Flags.string({ description: "explicit local cbm base URL" }),
    "symbol-entry": Flags.string({ description: "root symbol (qn or #id)" }),
    graph: Flags.string({ description: "GraphViewData JSON fixture" }),
    depth: Flags.integer({ default: 2, min: 1, max: 3, description: "BFS depth (1-3)" }),
    direction: Flags.string({
      options: ["both", "callers", "callees"],
      default: "both",
      description: "BFS direction",
    }),
    "max-nodes": Flags.integer({ default: 60, min: 1, description: "maximum graph nodes" }),
    format: Flags.string({
      options: ["svg", "orchgraph", "both"],
      default: "both",
      description: "output format",
    }),
    out: Flags.string({ description: "output base path (default: code-graph-<project>)" }),
    "layout-direction": Flags.string({
      options: ["DOWN", "UP", "LEFT", "RIGHT"],
      default: "DOWN",
      description: "layout direction",
    }),
    spacing: Flags.integer({ default: 3, min: 1, description: "orchgraph spacing" }),
    "max-node-width": Flags.integer({
      default: 32,
      min: 8,
      description: "orchgraph node width in cells",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RenderCommand);
    const root = resolve(flags.root);
    const backend = flags.backend as "cbm" | "scip";
    const resolved = await resolveProject(
      root,
      backend,
      backend === "scip" ? flags["scip-project"] : flags.project,
      flags["symbol-entry"],
    );
    const project = resolved.project;
    const view = await loadGraphData({
      cbm: flags.cbm,
      project,
      symbolEntry: resolved.symbolEntry,
      graph: flags.graph,
      depth: flags.depth as 1 | 2 | 3,
      direction: flags.direction as "both" | "callers" | "callees",
      maxNodes: flags["max-nodes"],
    });
    const base = flags.out ?? `code-graph-${safeName(project)}`;
    const files = await renderGraph(view, {
      format: flags.format as RenderFormat,
      out: base,
      layoutDirection: flags["layout-direction"] as "DOWN" | "UP" | "LEFT" | "RIGHT",
      spacing: flags.spacing,
      maxNodeWidth: flags["max-node-width"],
    });

    this.log(
      `Rendered ${view.nodes.length} nodes / ${view.edges.length} edges` +
        (view.truncated ? " (truncated)" : ""),
    );
    for (const path of Object.values(files)) this.log(`Wrote ${path}`);
  }
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "graph";
}
