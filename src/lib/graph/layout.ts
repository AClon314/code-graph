import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs/lib/elk-api.js";

import type { GraphViewData } from "./types";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  id: string;
  source: string;
  target: string;
  points: Array<{ x: number; y: number }>;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

export type LayoutDirection = "DOWN" | "RIGHT";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 64;

const PADDING_TOP = 56;
const PADDING_LEFT = 48;
const PADDING_BOTTOM = 48;
const PADDING_RIGHT = 80;
const SELF_LOOP_OFFSET = 30;

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.padding": `[top=${PADDING_TOP},left=${PADDING_LEFT},bottom=${PADDING_BOTTOM},right=${PADDING_RIGHT}]`,
  "elk.spacing.nodeNode": "64",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "28",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.cycleBreaking.strategy": "GREEDY",
  "elk.separateConnectedComponents": "true",
  "elk.spacing.componentComponent": "80",
};

/**
 * Create the browser-safe ELK instance. elkjs' bundled fake worker exports its
 * Worker constructor only when `self` is not visible (or when `document` is
 * present). Node/Bun expose `self` without `document`, so briefly hide it while
 * requiring the bundled worker. The returned fake worker uses setTimeout.
 */
export function createElk(): InstanceType<typeof ELK> {
  const globalScope = globalThis as unknown as { self?: unknown };
  const savedSelf = globalScope.self;
  const hideSelf = typeof document === "undefined" && savedSelf !== undefined;
  try {
    if (hideSelf) globalScope.self = undefined;
    return new ELK();
  } finally {
    if (hideSelf) globalScope.self = savedSelf;
  }
}

/**
 * Layout a `GraphViewData` snapshot with ELK's layered algorithm.
 *
 * Self edges are routed by hand: ELK's layered router can drop or flatten
 * them, and the UI must always show a recursive call as a visible loop.
 * Coordinates are rounded so repeated layouts of the same input are stable.
 */
export async function layoutGraphView(
  data: GraphViewData,
  direction: LayoutDirection = "DOWN",
): Promise<GraphLayout> {
  const nodes = data.nodes.map((node) => ({
    id: node.id,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: ElkExtendedEdge[] = [];
  const seenIds = new Set<string>();
  const edgeIdByIndex = new Map<number, string>();

  data.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    const id = uniqueEdgeId(edge.id || `edge:${index}`, index, seenIds);
    edgeIdByIndex.set(index, id);
    if (edge.source === edge.target) {
      return;
    }
    edges.push({
      id,
      sources: [edge.source],
      targets: [edge.target],
    });
  });

  const graph: ElkNode = {
    id: "code-graph",
    layoutOptions: {
      ...LAYOUT_OPTIONS,
      "elk.direction": direction,
    },
    children: nodes,
    edges,
  };

  let positioned: PositionedGraph | null = null;
  try {
    const elk = createElk();
    const result = await elk.layout(graph);
    const elkNodes = (result.children ?? []).map((child) => ({
      id: child.id,
      x: round(child.x ?? 0),
      y: round(child.y ?? 0),
      width: round(child.width ?? NODE_WIDTH),
      height: round(child.height ?? NODE_HEIGHT),
    }));
    const elkEdges = new Map<string, ElkExtendedEdge>();
    for (const edge of (result.edges ?? []) as ElkExtendedEdge[]) {
      if (edge.id) elkEdges.set(edge.id, edge);
    }
    positioned = {
      nodes: elkNodes,
      width: round(result.width ?? 0),
      height: round(result.height ?? 0),
      edges: elkEdges,
    };
  } catch {
    // Last-resort deterministic layout if a host cannot start ELK's bundled
    // worker at all.
    positioned = fallbackPosition(nodes, edges, direction);
  }

  const positions = new Map<string, LaidOutNode>();
  for (const node of positioned.nodes) positions.set(node.id, node);
  const elkEdges = positioned.edges;

  const laidOutEdges: LaidOutEdge[] = [];
  data.edges.forEach((edge, index) => {
    if (!positions.has(edge.source) || !positions.has(edge.target)) return;
    const id = edgeIdByIndex.get(index);
    if (!id) return;
    if (edge.source === edge.target) {
      laidOutEdges.push({
        id,
        source: edge.source,
        target: edge.target,
        points: selfLoopPoints(positions.get(edge.source)!),
      });
      return;
    }

    const routed = elkEdges.get(id);
    const points = routed ? pointsFromElk(routed) : [];
    laidOutEdges.push({
      id,
      source: edge.source,
      target: edge.target,
      points:
        points.length >= 2
          ? points
          : fallbackPoints(positions.get(edge.source)!, positions.get(edge.target)!, direction),
    });
  });

  // Ensure the hand-routed loops are inside the exported view box.
  let maxX = positioned.width;
  let maxY = positioned.height;
  for (const edge of laidOutEdges) {
    for (const point of edge.points) {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  return {
    width: Math.max(maxX, PADDING_LEFT + PADDING_RIGHT),
    height: Math.max(maxY, PADDING_TOP + PADDING_BOTTOM),
    nodes: [...positions.values()],
    edges: laidOutEdges,
  };
}

interface PositionedGraph {
  nodes: LaidOutNode[];
  width: number;
  height: number;
  edges: Map<string, ElkExtendedEdge>;
}

/**
 * Deterministic layered fallback for environments where elkjs' bundled fake
 * worker cannot start. The browser path still uses ELK; this path only keeps
 * tests/SSR from turning a graph into an empty canvas.
 */
function fallbackPosition(
  nodes: Array<{ id: string; width: number; height: number }>,
  edges: ElkExtendedEdge[],
  direction: LayoutDirection,
): PositionedGraph {
  const ids = nodes.map((node) => node.id);
  const layers = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }

  for (const edge of edges) {
    const source = edge.sources[0];
    const target = edge.targets[0];
    if (!source || !target || !adjacency.has(source) || !adjacency.has(target)) continue;
    adjacency.get(source)!.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!layers.has(id)) layers.set(id, 0);
    const current = layers.get(id) ?? 0;
    for (const target of adjacency.get(id) ?? []) {
      layers.set(target, Math.max(layers.get(target) ?? 0, current + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if ((indegree.get(target) ?? 0) === 0) queue.push(target);
    }
  }

  // Cycles never enter the Kahn queue. Give each remaining component layers
  // via a BFS so recursive call cycles do not all collapse into one row.
  for (const id of ids) {
    if (layers.has(id)) continue;
    layers.set(id, 0);
    const pending = [id];
    while (pending.length > 0) {
      const current = pending.shift()!;
      const depth = layers.get(current) ?? 0;
      for (const target of adjacency.get(current) ?? []) {
        if (layers.has(target)) continue;
        layers.set(target, depth + 1);
        pending.push(target);
      }
    }
  }

  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const layer = layers.get(id) ?? 0;
    const row = byLayer.get(layer) ?? [];
    row.push(id);
    byLayer.set(layer, row);
  }
  const layerRows = [...byLayer.entries()].sort(([a], [b]) => a - b);

  const positioned: LaidOutNode[] = [];
  let maxX = PADDING_LEFT + PADDING_RIGHT;
  let maxY = PADDING_TOP + PADDING_BOTTOM;
  layerRows.forEach(([, row], layerIndex) => {
    row.forEach((id, rowIndex) => {
      const node = nodes.find((candidate) => candidate.id === id)!;
      const x =
        direction === "RIGHT"
          ? PADDING_LEFT + layerIndex * (NODE_WIDTH + 96)
          : PADDING_LEFT + rowIndex * (NODE_WIDTH + 64);
      const y =
        direction === "RIGHT"
          ? PADDING_TOP + rowIndex * (NODE_HEIGHT + 64)
          : PADDING_TOP + layerIndex * (NODE_HEIGHT + 96);
      const placed: LaidOutNode = {
        id,
        x: round(x),
        y: round(y),
        width: round(node.width),
        height: round(node.height),
      };
      positioned.push(placed);
      maxX = Math.max(maxX, placed.x + placed.width + PADDING_RIGHT);
      maxY = Math.max(maxY, placed.y + placed.height + PADDING_BOTTOM);
    });
  });

  return { nodes: positioned, width: maxX, height: maxY, edges: new Map() };
}

function uniqueEdgeId(id: string, index: number, seen: Set<string>): string {
  let next = id;
  let suffix = 1;
  while (seen.has(next)) {
    next = `${id}:${index}-${suffix++}`;
  }
  seen.add(next);
  return next;
}

function pointsFromElk(edge: ElkExtendedEdge): Array<{ x: number; y: number }> {
  const section = edge.sections?.[0];
  if (!section) return [];
  const points: ElkPoint[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
  return points.map((point) => ({ x: round(point.x), y: round(point.y) }));
}

function selfLoopPoints(node: LaidOutNode): Array<{ x: number; y: number }> {
  const right = round(node.x + node.width);
  const centerX = round(node.x + node.width / 2);
  const startY = round(node.y + node.height * 0.62);
  const top = round(node.y);
  const loopX = round(right + SELF_LOOP_OFFSET);
  const loopY = round(top - SELF_LOOP_OFFSET);
  return [
    { x: right, y: startY },
    { x: loopX, y: startY },
    { x: loopX, y: loopY },
    { x: centerX, y: loopY },
    { x: centerX, y: top },
  ];
}

function fallbackPoints(
  source: LaidOutNode,
  target: LaidOutNode,
  direction: LayoutDirection,
): Array<{ x: number; y: number }> {
  if (direction === "RIGHT") {
    const start = { x: round(source.x + source.width), y: round(source.y + source.height / 2) };
    const end = { x: round(target.x), y: round(target.y + target.height / 2) };
    const midX = round((start.x + end.x) / 2);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const start = { x: round(source.x + source.width / 2), y: round(source.y + source.height) };
  const end = { x: round(target.x + target.width / 2), y: round(target.y) };
  const midY = round((start.y + end.y) / 2);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function round(value: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.round(finite * 100) / 100;
}
