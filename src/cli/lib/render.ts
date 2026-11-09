import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { GraphDirection } from "orchgraph";

import { CbmHttpSource } from "../../lib/graph/cbm-http.ts";
import { fetchEntryCandidates } from "../../lib/graph/entries.ts";
import { loadGraphView } from "../../lib/graph/load.ts";
import type {
  NeighborhoodDepth,
  NeighborhoodDirection,
} from "../../lib/graph/neighborhood.ts";
import { renderGraphSvg } from "../../lib/graph/svg.ts";
import { buildTerminalCanvas } from "../../lib/graph/terminal.ts";
import type { GraphViewData } from "../../lib/graph/types.ts";
import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";

export type RenderFormat = "svg" | "orchgraph" | "both";
export type RenderDirection = NeighborhoodDirection;
export type LayoutDirection = GraphDirection;

export interface GraphOptions {
  cbm?: string;
  project: string;
  symbolEntry?: string;
  depth?: NeighborhoodDepth;
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
  if (options.graph) return loadGraphView({ graph: options.graph });

  const endpoint = await resolveCbmBaseUrl(options.cbm);
  const symbolEntry =
    options.symbolEntry ??
    (await discoverEntry(endpoint.baseUrl, options.project));
  const source = new CbmHttpSource({
    baseUrl: endpoint.baseUrl,
    project: options.project,
  });

  return loadGraphView({
    source,
    project: options.project,
    symbolEntry,
    depth: options.depth ?? 2,
    direction: options.direction ?? "both",
    maxNodes: options.maxNodes ?? 60,
  });
}

async function discoverEntry(baseUrl: string, project: string): Promise<string> {
  const candidate = (await fetchEntryCandidates(baseUrl, project, 1))[0];
  if (!candidate) {
    throw new Error(
      `no entry candidate in project "${project}"; pass --symbol-entry <qn>`,
    );
  }
  return candidate.qualifiedName;
}

export async function renderSvgText(
  data: GraphViewData,
  options: Pick<RenderOptions, "layoutDirection"> = {},
): Promise<string> {
  return renderGraphSvg(data, { direction: options.layoutDirection });
}

export async function renderOrchgraphText(
  data: GraphViewData,
  options: Pick<RenderOptions, "layoutDirection" | "spacing" | "maxNodeWidth"> = {},
): Promise<string> {
  const canvas = await buildTerminalCanvas(data, {
    direction: options.layoutDirection,
    spacing: options.spacing,
    maxNodeWidth: options.maxNodeWidth,
  });
  return `${canvas.lines.join("\n")}\n`;
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
    const path = outputPath(base, "svg");
    writeOutput(path, await renderSvgText(data, options));
    files.svg = path;
  }

  if (format === "orchgraph" || format === "both") {
    const path = outputPath(base, "orchgraph");
    writeOutput(path, await renderOrchgraphText(data, options));
    files.orchgraph = path;
  }

  return files;
}

function outputPath(base: string, kind: "svg" | "orchgraph"): string {
  const extension = kind === "svg" ? ".svg" : ".txt";
  return base.endsWith(extension) ? base : `${base}${extension}`;
}

function writeOutput(path: string, content: string): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}
