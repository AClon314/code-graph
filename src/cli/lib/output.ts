import {
  loadGraphData,
  renderGraph,
  renderOrchgraphText,
  renderSvgText,
  type RenderFormat,
} from "./render.ts";
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
  stream?: boolean;
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
  stdout?: string;
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
  if (options.stream) {
    if (options.format === "both") {
      throw new Error("piped output needs --format orchgraph or --format svg, not both");
    }
    const content =
      options.format === "svg"
        ? await renderSvgText(view, options)
        : await renderOrchgraphText(view, options);
    return {
      project,
      nodes: view.nodes.length,
      edges: view.edges.length,
      truncated: view.truncated,
      files: [],
      stdout: content,
    };
  }

  const base = options.out ?? `code-graph.${safeName(project.project)}`;
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

export function resolveOutputMode(explicitFormat?: string): {
  format: RenderFormat;
  stream: boolean;
} {
  const stream = !process.stdout.isTTY;
  return {
    stream,
    format: (explicitFormat as RenderFormat | undefined) ?? (stream ? "orchgraph" : "both"),
  };
}

export function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "graph";
}
