import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { GraphDirection } from "orchgraph";

import { CbmHttpSource } from "../../lib/graph/cbm-http.ts";
import { entryCandidates, type RepositoryNode } from "../../lib/graph/entries.ts";
import {
  loadNeighborhood,
  type NeighborhoodDirection,
} from "../../lib/graph/neighborhood.ts";
import { renderGraphSvg } from "../../lib/graph/svg.ts";
import { buildTerminalCanvas } from "../../lib/graph/terminal.ts";
import type { GraphViewData } from "../../lib/graph/types.ts";
import { resolveCbmBaseUrl } from "../../../tui/cbm-discovery.ts";

export type RenderFormat = "svg" | "orchgraph" | "both";
export type RenderDirection = NeighborhoodDirection;
export type LayoutDirection = GraphDirection;

export interface GraphOptions {
  cbm?: string;
  project: string;
  symbolEntry?: string;
  depth?: 1 | 2 | 3;
  direction?: RenderDirection;
  maxNodes?: number;
  graph?: string;
}

export interface RenderOptions {
  format?: RenderFormat;
  out?: string;
  layoutDirection?: LayoutDirection;
  spacing?: number;
  maxNodeWidth?: number;
}

export interface RenderedFiles {
  svg?: string;
  orchgraph?: string;
}

/** Load a graph from a fixture or a live cbm project. */
export async function loadGraphData(options: GraphOptions): Promise<GraphViewData> {
  if (options.graph) return readGraphFile(options.graph);

  const endpoint = await resolveCbmBaseUrl(options.cbm);
  const symbolEntry =
    options.symbolEntry ??
    (await discoverEntry(endpoint.baseUrl, options.project));
  const source = new CbmHttpSource({
    baseUrl: endpoint.baseUrl,
    project: options.project,
  });

  return loadNeighborhood(source, options.project, symbolEntry, {
    depth: options.depth ?? 2,
    direction: options.direction ?? "both",
    maxNodes: options.maxNodes ?? 60,
  });
}

function readGraphFile(path: string): GraphViewData {
  const absolute = resolve(path);
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as Partial<GraphViewData>;
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error(`graph fixture has no nodes/edges arrays: ${absolute}`);
  }
  return {
    root: typeof parsed.root === "string" ? parsed.root : parsed.nodes[0]?.id ?? "",
    nodes: parsed.nodes,
    edges: parsed.edges,
    truncated: parsed.truncated === true,
  };
}

async function discoverEntry(baseUrl: string, project: string): Promise<string> {
  const url = new URL("/api/repository-map", baseUrl);
  url.searchParams.set("project", project);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `cannot discover an entry for project "${project}": ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as { nodes?: RepositoryNode[] };
  const candidate = entryCandidates(payload.nodes ?? [], 1)[0];
  if (!candidate) {
    throw new Error(
      `no entry candidate in project "${project}"; pass --symbol-entry <qn>`,
    );
  }
  return candidate.qualifiedName;
}

/** Write SVG and/or orchgraph output; returns the actual paths. */
export async function renderGraph(
  data: GraphViewData,
  options: RenderOptions = { format: "both", out: "code-graph" },
): Promise<RenderedFiles> {
  if (data.nodes.length === 0) throw new Error("graph has no nodes");

  const format = options.format ?? "both";
  const base = options.out ?? "code-graph";
  const files: RenderedFiles = {};

  if (format === "svg" || format === "both") {
    const path = format === "svg" ? base : `${base}.svg`;
    const svg = await renderGraphSvg(data, {
      direction: options.layoutDirection,
    });
    writeOutput(path, svg);
    files.svg = path;
  }

  if (format === "orchgraph" || format === "both") {
    const path = format === "orchgraph" ? base : `${base}.orchgraph.txt`;
    const canvas = await buildTerminalCanvas(data, {
      direction: options.layoutDirection,
      spacing: options.spacing,
      maxNodeWidth: options.maxNodeWidth,
    });
    writeOutput(path, `${canvas.lines.join("\n")}\n`);
    files.orchgraph = path;
  }

  return files;
}

function writeOutput(path: string, content: string): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

export function outputExists(path: string): boolean {
  return existsSync(path);
}
