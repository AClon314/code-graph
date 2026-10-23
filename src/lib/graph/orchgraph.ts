import type { GraphDocument, GraphEdge, GraphGeometry, GraphNode } from "orchgraph";

import type { GraphViewData, GraphViewEdge, GraphViewNode } from "./types";
import type { GraphLayout } from "./layout";

/**
 * Running-state spinner. Braille patterns are one cell wide in Maple Mono NF
 * CN (verified against the CDN font), unlike `◐` (U+25D0), which the font does
 * not cover and which therefore fell back to a proportional glyph.
 *
 * The frame sequence is shared by the browser canvas and the TUI frame builder;
 * both currently render frame 0, but both accept the full sequence.
 */
export const RUNNING_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

function nodeDetail(node: GraphViewNode): string | undefined {
  if (!node.filePath) return undefined;
  return `${node.filePath}:${node.startLine ?? 1}`;
}

function toGraphNode(node: GraphViewNode): GraphNode {
  const file = node.filePath ?? "";
  const line = node.startLine ?? 0;
  const qn = node.qualifiedName || node.id;
  const result: GraphNode = {
    id: node.id,
    label: node.name || qn || node.id,
    kind: node.label || "node",
    metadata: { file, line, qn },
  };
  const detail = nodeDetail(node);
  if (detail) result.detail = detail;
  return result;
}

function stableEdgeId(edge: GraphViewEdge, seen: Map<string, number>): string {
  const base = edge.id || `${edge.source}->${edge.target}:${edge.type || "EDGE"}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}#${count + 1}`;
}

/** Convert the UI graph model into orchgraph's validated document model. */
export function toGraphDocument(view: GraphViewData): GraphDocument {
  const seenNodes = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const node of view.nodes ?? []) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) continue;
    if (seenNodes.has(node.id)) continue;
    seenNodes.add(node.id);
    nodes.push(toGraphNode(node));
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Map<string, number>();
  const edges: GraphEdge[] = [];
  for (const edge of view.edges ?? []) {
    if (!edge || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const kind = edge.type || "EDGE";
    edges.push({
      id: stableEdgeId(edge, edgeIds),
      source: edge.source,
      target: edge.target,
      label: edge.label ?? kind,
      kind,
      direction: "forward",
    });
  }

  return {
    id: "code-graph",
    direction: "DOWN",
    nodes,
    edges,
    metadata: { root: view.root, truncated: view.truncated },
  };
}

/** Adapt the shared ELK layout to the geometry shape expected by orchgraph. */
export function toGraphGeometry(layout: GraphLayout): GraphGeometry {
  return {
    width: layout.width,
    height: layout.height,
    nodes: layout.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
    edges: layout.edges.map((edge) => ({
      id: edge.id,
      sections: edge.points.length > 0 ? [edge.points] : [],
      labels: [],
    })),
  };
}
