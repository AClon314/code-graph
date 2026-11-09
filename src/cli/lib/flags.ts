import { Flags } from "@oclif/core";

/** Flags shared by the live graph renderers. */
export const graphFlags = {
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

/** Flags used only while building an index. */
export const indexTuningFlags = {
  mode: Flags.string({
    options: ["fast", "moderate", "full"],
    default: "moderate",
    description: "cbm-native indexing mode",
  }),
  "scip-indexer": Flags.string({ description: "scip-typescript entry point" }),
  writer: Flags.string({ description: "scip-cbm-writer directory" }),
  "scip-output": Flags.string({ description: "keep the generated .scip at this path" }),
  "cache-dir": Flags.string({ description: "shared cbm cache directory" }),
  "cbm-bin": Flags.string({ description: "codebase-memory-mcp binary" }),
  bun: Flags.string({ description: "bun binary used for scip-cbm-writer" }),
  node: Flags.string({ description: "node binary used for scip-typescript" }),
};

export const indexFlags = {
  ...indexTuningFlags,
  backend: Flags.string({
    char: "b",
    options: ["cbm", "scip", "both"],
    default: "cbm",
    description: "index backend",
  }),
  root: Flags.string({ description: "workspace root", default: process.cwd() }),
  project: Flags.string({ description: "cbm-native project name (default: workspace basename)" }),
  "scip-project": Flags.string({ description: "SCIP project name (default: <project>-scip)" }),
};
