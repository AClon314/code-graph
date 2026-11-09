import { Command, Flags } from "@oclif/core";
import { resolve } from "node:path";

import { runIndex } from "../lib/indexer.ts";
import { resolveProject } from "../lib/project.ts";
import { loadGraphData, renderGraph, type RenderFormat } from "../lib/render.ts";

export default class GraphCommand extends Command {
  static summary = "One-click index + SVG/orchgraph render";
  static description =
    "Index the workspace (unless --graph is supplied), then render the same graph model used by the GUI and TUI.";
  static examples = [
    "<%= config.bin %> graph --backend cbm",
    "<%= config.bin %> graph --backend scip --project my-project --format both",
    "<%= config.bin %> graph --graph tui/fixture-graph.json --format svg",
  ];
  static flags = {
    backend: Flags.string({
      char: "b",
      options: ["cbm", "scip"],
      default: "cbm",
      description: "index and render backend",
    }),
    root: Flags.string({ description: "workspace root", default: process.cwd() }),
    project: Flags.string({ description: "cbm-native project name" }),
    "scip-project": Flags.string({ description: "SCIP project name" }),
    mode: Flags.string({
      options: ["fast", "moderate", "full"],
      default: "moderate",
      description: "cbm-native indexing mode",
    }),
    cbm: Flags.string({ description: "explicit local cbm base URL" }),
    "symbol-entry": Flags.string({ description: "root symbol (qn or #id)" }),
    graph: Flags.string({ description: "skip indexing and render this GraphViewData fixture" }),
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
    "scip-indexer": Flags.string({ description: "scip-typescript entry point" }),
    writer: Flags.string({ description: "scip-cbm-writer directory" }),
    "scip-output": Flags.string({ description: "keep the generated .scip at this path" }),
    "cache-dir": Flags.string({ description: "shared cbm cache directory" }),
    "cbm-bin": Flags.string({ description: "codebase-memory-mcp binary" }),
    bun: Flags.string({ description: "bun binary used for scip-cbm-writer" }),
    node: Flags.string({ description: "node binary used for scip-typescript" }),
  };

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

    const resolved = await resolveProject(
      root,
      backend,
      backend === "scip" ? scip.project : cbm.project,
      flags["symbol-entry"],
    );
    const view = await loadGraphData({
      cbm: flags.cbm,
      project: resolved.project,
      symbolEntry: resolved.symbolEntry,
      graph: flags.graph,
      depth: flags.depth as 1 | 2 | 3,
      direction: flags.direction as "both" | "callers" | "callees",
      maxNodes: flags["max-nodes"],
    });
    const base = flags.out ?? `code-graph-${safeName(resolved.project)}`;
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
