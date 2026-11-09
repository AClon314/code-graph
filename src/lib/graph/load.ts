import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  loadNeighborhood,
  type NeighborhoodDepth,
  type NeighborhoodDirection,
} from "./neighborhood.ts";
import type { GraphSource, GraphViewData } from "./types.ts";

export interface LoadGraphOptions {
  /** GraphViewData fixture; when set, no cbm source is used. */
  graph?: string;
  source?: GraphSource;
  project?: string;
  symbolEntry?: string;
  depth?: NeighborhoodDepth;
  direction?: NeighborhoodDirection;
  maxNodes?: number;
}

/** Load a fixture or a live cbm neighborhood through one entry point. */
export async function loadGraphView(options: LoadGraphOptions): Promise<GraphViewData> {
  if (options.graph) return readGraphFile(options.graph);
  if (!options.source || !options.project || !options.symbolEntry) {
    throw new Error("live graph loading needs source, project and symbolEntry");
  }
  return loadNeighborhood(options.source, options.project, options.symbolEntry, {
    depth: options.depth,
    direction: options.direction,
    maxNodes: options.maxNodes,
  });
}

/** Read and minimally validate the GraphViewData JSON used by tests/TUI. */
export function readGraphFile(path: string): GraphViewData {
  const absolute = resolve(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`cannot read graph ${absolute}: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${absolute} is not a GraphViewData object`);
  }
  const raw = parsed as Partial<GraphViewData>;
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new Error(`${absolute}: nodes must be a non-empty array`);
  }
  return {
    root:
      typeof raw.root === "string" && raw.root.length > 0
        ? raw.root
        : raw.nodes[0]!.id,
    nodes: raw.nodes,
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    truncated: raw.truncated === true,
  };
}
