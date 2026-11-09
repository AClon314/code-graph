import { loadGraphData, renderGraph, type RenderFormat } from "./render.ts";
import { resolveProject, type ResolvedProject } from "./project.ts";

export interface RenderRunOptions {
  root: string;
  backend: "cbm" | "scip";
  project?: string;
  scipProject?: string;
  cbm?: string;
  symbolEntry?: string;
  graph?: string;
  depth: 1 | 2 | 3;
  direction: "both" | "callers" | "callees";
  maxNodes: number;
  format: RenderFormat;
  out?: string;
  layoutDirection: "DOWN" | "UP" | "LEFT" | "RIGHT";
  spacing: number;
  maxNodeWidth: number;
}

export interface RenderRunResult {
  project: ResolvedProject;
  nodes: number;
  edges: number;
  truncated: boolean;
  files: string[];
}

/** Resolve one backend, load its graph, and write the requested outputs. */
export async function renderResolved(options: RenderRunOptions): Promise<RenderRunResult> {
  const project = await resolveProject(
    options.root,
    options.backend,
    options.backend === "scip" ? options.scipProject : options.project,
    options.symbolEntry,
  );
  const view = await loadGraphData({
    cbm: options.cbm,
    project: project.project,
    symbolEntry: project.symbolEntry,
    graph: options.graph,
    depth: options.depth,
    direction: options.direction,
    maxNodes: options.maxNodes,
  });
  const base = options.out ?? `code-graph-${safeName(project.project)}`;
  const files = await renderGraph(view, {
    format: options.format,
    out: base,
    layoutDirection: options.layoutDirection,
    spacing: options.spacing,
    maxNodeWidth: options.maxNodeWidth,
  });

  return {
    project,
    nodes: view.nodes.length,
    edges: view.edges.length,
    truncated: view.truncated,
    files: Object.values(files),
  };
}

export function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "graph";
}
