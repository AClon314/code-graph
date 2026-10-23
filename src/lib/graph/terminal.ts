/**
 * Browser-safe terminal canvas for the web orchgraph renderer.
 *
 * Portions derived from orchgraph 0.2.4 (`dist/layout.js`), MIT License,
 * Copyright (c) 2026 maestroJeong. See node_modules/orchgraph/LICENSE.
 *
 * orchgraph's `orchgraph` root entry pulls `node:module` and
 * `node:worker_threads` into the bundle, so it cannot be imported by Vite.
 * `orchgraph/terminal` is browser-safe but only consumes a TerminalCanvas.
 * This file contains a narrow copy of the geometry -> canvas step from
 * orchgraph 0.2.4 (`dist/layout.js`, `renderCanvas`) plus the text measurement
 * helpers it uses. Keep it in sync when upgrading orchgraph.
 */
import stringWidth from "string-width";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import { renderTerminalCanvas } from "orchgraph/terminal";
import type {
  GraphDirection,
  GraphDocument,
  GraphGeometry,
  GraphNode,
  NodeState,
  TerminalCanvas,
  TerminalEdge,
  TerminalNode,
} from "orchgraph";

import { createElk } from "./layout";
import { toGraphDocument } from "./orchgraph";
import type { GraphViewData } from "./types";

const MIN_NODE_WIDTH = 14;
const DEFAULT_MAX_NODE_WIDTH = 48;
const MIN_SPACING = 2;
const MAX_SPACING = 20;

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(value: string): string[] {
  return [...GRAPHEME_SEGMENTER.segment(value)].map(({ segment }) => segment);
}

function displayWidth(value: string): number {
  return stringWidth(value);
}

function splitWideWord(value: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  let width = 0;
  for (const segment of graphemes(value)) {
    const characterWidth = displayWidth(segment);
    if (current && width + characterWidth > maxWidth) {
      parts.push(current);
      current = "";
      width = 0;
    }
    current += segment;
    width += characterWidth;
  }
  if (current) parts.push(current);
  return parts;
}

function wrapDisplayText(value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const parts = displayWidth(word) > maxWidth ? splitWideWord(word, maxWidth) : [word];
      for (const part of parts) {
        const candidate = line ? `${line} ${part}` : part;
        if (line && displayWidth(candidate) > maxWidth) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function layoutNodeText(
  node: Pick<GraphNode, "label" | "detail" | "kind">,
  maxNodeWidth = DEFAULT_MAX_NODE_WIDTH,
): { width: number; height: number; labelLines: string[]; detailLines: string[] } {
  const widthLimit = Math.max(MIN_NODE_WIDTH, Math.floor(maxNodeWidth));
  const labelLines = wrapDisplayText(node.label, widthLimit - 6);
  const detail = node.detail ?? node.kind ?? "";
  const detailLines = detail ? wrapDisplayText(detail, widthLimit - 4) : [];
  const width = Math.min(
    widthLimit,
    Math.max(
      MIN_NODE_WIDTH,
      ...labelLines.map((line) => displayWidth(line) + 6),
      ...detailLines.map((line) => displayWidth(line) + 4),
    ),
  );
  return {
    width,
    height: Math.max(4, 2 + labelLines.length + detailLines.length),
    labelLines,
    detailLines,
  };
}

function markerForState(state: NodeState | undefined): string {
  switch (state) {
    case "running":
      return "●";
    case "blocked":
      return "◆";
    case "succeeded":
      return "✓";
    case "failed":
      return "✕";
    case "queued":
      return "◌";
    default:
      return "○";
  }
}

function resolveEdgeIds(edges: GraphDocument["edges"]): string[] {
  const occurrences = new Map<string, number>();
  return edges.map((edge) => {
    if (edge.id) return edge.id;
    const base = `${edge.kind ?? "edge"}:${edge.source}:${edge.target}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return `${base}:${occurrence}`;
  });
}

function normalizedSpacing(value = 4): number {
  if (!Number.isFinite(value)) return 4;
  return Math.min(MAX_SPACING, Math.max(MIN_SPACING, Math.round(value)));
}

function rounded(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

function geometryFromElk(layout: ElkNode): GraphGeometry {
  return {
    width: rounded(layout.width),
    height: rounded(layout.height),
    nodes: (layout.children ?? []).map((node) => ({
      id: node.id,
      x: rounded(node.x),
      y: rounded(node.y),
      width: rounded(node.width),
      height: rounded(node.height),
    })),
    edges: (layout.edges ?? []).map((edge) => {
      const extended = edge as ElkExtendedEdge;
      return {
        id: extended.id,
        sections: (extended.sections ?? []).map((section) => [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ].map((point) => ({ x: rounded(point.x), y: rounded(point.y) }))),
        labels: (extended.labels ?? []).map((label) => ({
          x: rounded(label.x),
          y: rounded(label.y),
          width: rounded(label.width),
          height: rounded(label.height),
        })),
      };
    }),
  };
}

async function layoutTerminalGeometry(
  graph: GraphDocument,
  direction: GraphDirection,
  spacing: number,
  maxNodeWidth: number,
): Promise<GraphGeometry> {
  const edgeIds = resolveEdgeIds(graph.edges);
  const elkGraph: ElkNode = {
    id: graph.id ?? "orchgraph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=1,left=1,bottom=1,right=1]",
      "elk.spacing.nodeNode": String(spacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(2, spacing - 1)),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.max(1, spacing / 2)),
      "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.max(1, spacing / 2)),
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: graph.nodes.map((node) => {
      const text = layoutNodeText(node, maxNodeWidth);
      return { id: node.id, width: text.width, height: text.height };
    }),
    edges: graph.edges.map((edge, index) => {
      const id = edgeIds[index] ?? `edge:${index}`;
      return {
        id,
        sources: [edge.source],
        targets: [edge.target],
        ...(edge.label
          ? {
              labels: [
                {
                  id: `${id}:label`,
                  text: edge.label,
                  width: displayWidth(edge.label) + 2,
                  height: 1,
                },
              ],
            }
          : {}),
      };
    }),
  };

  const elk = createElk();
  const result = await elk.layout(elkGraph);
  return geometryFromElk(result);
}

/**
 * Geometry -> terminal canvas. Copied from orchgraph 0.2.4's `renderCanvas`
 * so the browser can use the same box-drawing/arrow routing as the TUI.
 */
function renderCanvas(graph: GraphDocument, layout: GraphGeometry): TerminalCanvas {
  const width = Math.max(1, layout.width + 2);
  const height = Math.max(1, layout.height + 2);
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
  const put = (x: number, y: number, value: string): void => {
    if (y < 0 || y >= height || x < 0 || x >= width) return;
    const row = cells[y];
    if (row) row[x] = value;
  };
  const putText = (x: number, y: number, value: string, maxWidth: number): void => {
    let column = 0;
    for (const character of graphemes(value)) {
      const characterWidth = displayWidth(character);
      if (column + characterWidth > maxWidth) break;
      put(x + column, y, character);
      if (characterWidth === 2) put(x + column + 1, y, "");
      column += characterWidth;
    }
  };

  const edgeIds = resolveEdgeIds(graph.edges);
  const edgesById = new Map(
    graph.edges.map((edge, index) => {
      const id = edgeIds[index] ?? `edge:${index}`;
      return [id, { ...edge, id }] as const;
    }),
  );
  const terminalEdges: TerminalEdge[] = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];

  const directionMask = new Map<string, number>();
  const styleCounts = new Map<string, { dashed: number; solid: number }>();
  const cellKey = (x: number, y: number): string => `${x}:${y}`;
  const markDirection = (x: number, y: number, bit: number, dashed: boolean): void => {
    const key = cellKey(x, y);
    directionMask.set(key, (directionMask.get(key) ?? 0) | bit);
    const counts = styleCounts.get(key) ?? { dashed: 0, solid: 0 };
    if (dashed) counts.dashed += 1;
    else counts.solid += 1;
    styleCounts.set(key, counts);
  };

  const resolvedEdges: Array<{
    edge: GraphDocument["edges"][number];
    laidOutEdge: GraphGeometry["edges"][number];
    sections: Array<Array<{ x: number; y: number }>>;
  }> = [];

  for (const laidOutEdge of layout.edges) {
    const edge = edgesById.get(laidOutEdge.id);
    if (!edge) continue;
    const dashed = (edge.style ?? "solid") === "dashed";
    const sections: Array<Array<{ x: number; y: number }>> = [];
    for (const section of laidOutEdge.sections) {
      const points = section.map((point) => ({ x: point.x + 1, y: point.y + 1 }));
      sections.push(points);
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to) continue;
        const horizontal = from.y === to.y;
        const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
        const xStep = horizontal ? Math.sign(to.x - from.x) : 0;
        const yStep = horizontal ? 0 : Math.sign(to.y - from.y);
        const { forward, backward } = stepBits(xStep, yStep);
        for (let offset = 0; offset < distance; offset += 1) {
          const fromX = from.x + xStep * offset;
          const fromY = from.y + yStep * offset;
          const toX = from.x + xStep * (offset + 1);
          const toY = from.y + yStep * (offset + 1);
          markDirection(fromX, fromY, forward, dashed);
          markDirection(toX, toY, backward, dashed);
        }
      }
    }
    resolvedEdges.push({ edge, laidOutEdge, sections });
  }

  for (const [key, mask] of directionMask) {
    const [x, y] = key.split(":").map(Number);
    if (x === undefined || y === undefined) continue;
    const counts = styleCounts.get(key);
    const dashedOnly = counts !== undefined && counts.solid === 0 && counts.dashed > 0;
    put(x, y, glyphForDirections(mask, dashedOnly));
  }

  for (const { edge, laidOutEdge, sections } of resolvedEdges) {
    const edgeCells = new Map<string, { x: number; y: number }>();
    for (const points of sections) {
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to) continue;
        const horizontal = from.y === to.y;
        const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
        const xStep = horizontal ? Math.sign(to.x - from.x) : 0;
        const yStep = horizontal ? 0 : Math.sign(to.y - from.y);
        for (let offset = 0; offset <= distance; offset += 1) {
          const x = from.x + xStep * offset;
          const y = from.y + yStep * offset;
          edgeCells.set(`${x}:${y}`, { x, y });
        }
      }
      const first = points[0];
      const second = points[1];
      const last = points.at(-1);
      const beforeLast = points.at(-2);
      const direction = edge.direction ?? "forward";
      if (first && second && shouldPointFromStart(direction)) {
        const point = {
          x: first.x + Math.sign(second.x - first.x),
          y: first.y + Math.sign(second.y - first.y),
        };
        put(point.x, point.y, arrow(second, first));
        edgeCells.set(`${point.x}:${point.y}`, point);
      }
      if (last && beforeLast && shouldPointToEnd(direction)) {
        const point = {
          x: last.x - Math.sign(last.x - beforeLast.x),
          y: last.y - Math.sign(last.y - beforeLast.y),
        };
        put(point.x, point.y, arrow(beforeLast, last));
        edgeCells.set(`${point.x}:${point.y}`, point);
      }
      if (edge.label && points.length > 1) {
        const laidOutLabel = laidOutEdge.labels?.[0];
        const middle = laidOutLabel
          ? {
              x: laidOutLabel.x + 1 + Math.floor(laidOutLabel.width / 2),
              y: laidOutLabel.y + 1,
            }
          : midpoint(points);
        const text = ` ${edge.label} `;
        labels.push({
          x: middle.x - Math.floor(displayWidth(text) / 2),
          y: middle.y,
          text,
        });
      }
    }
    terminalEdges.push({
      id: edge.id ?? laidOutEdge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.kind ? { kind: edge.kind } : {}),
      ...(edge.metadata ? { metadata: edge.metadata } : {}),
      cells: [...edgeCells.values()],
    });
  }

  for (const label of labels) putText(label.x, label.y, label.text, displayWidth(label.text));

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const terminalNodes: TerminalNode[] = [];
  for (const laidOutNode of layout.nodes) {
    const node = nodesById.get(laidOutNode.id);
    if (!node) continue;
    const x = laidOutNode.x + 1;
    const y = laidOutNode.y + 1;
    const nodeWidth = Math.max(4, laidOutNode.width);
    const nodeHeight = Math.max(4, laidOutNode.height);
    for (let row = 0; row < nodeHeight; row += 1) {
      for (let column = 0; column < nodeWidth; column += 1) put(x + column, y + row, " ");
    }
    put(x, y, "╭");
    put(x + nodeWidth - 1, y, "╮");
    put(x, y + nodeHeight - 1, "╰");
    put(x + nodeWidth - 1, y + nodeHeight - 1, "╯");
    for (let column = 1; column < nodeWidth - 1; column += 1) {
      put(x + column, y, "─");
      put(x + column, y + nodeHeight - 1, "─");
    }
    for (let row = 1; row < nodeHeight - 1; row += 1) {
      put(x, y + row, "│");
      put(x + nodeWidth - 1, y + row, "│");
    }
    const text = layoutNodeText(node, nodeWidth);
    text.labelLines.forEach((value, index) => {
      putText(x + 2, y + 1 + index, index === 0 ? `${markerForState(node.state ?? "idle")} ${value}` : `  ${value}`, nodeWidth - 3);
    });
    text.detailLines.forEach((value, index) => {
      putText(x + 2, y + 1 + text.labelLines.length + index, value, nodeWidth - 3);
    });
    terminalNodes.push({
      id: node.id,
      label: node.label,
      ...(node.detail ? { detail: node.detail } : {}),
      ...(node.kind ? { kind: node.kind } : {}),
      state: node.state ?? "idle",
      ...(node.metadata ? { metadata: node.metadata } : {}),
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      markerX: x + 2,
      markerY: y + 1,
    });
  }

  return {
    ...(graph.id ? { id: graph.id } : {}),
    ...(graph.title ? { title: graph.title } : {}),
    ...(graph.metadata ? { metadata: graph.metadata } : {}),
    nodes: terminalNodes,
    edges: terminalEdges,
    lines: cells.map((row) => row.join("").trimEnd()),
    width,
    height,
  };
}

const DIR_UP = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 4;
const DIR_RIGHT = 8;

const CORNER_GLYPH: Record<number, string> = {
  [DIR_DOWN | DIR_RIGHT]: "╭",
  [DIR_DOWN | DIR_LEFT]: "╮",
  [DIR_UP | DIR_RIGHT]: "╰",
  [DIR_UP | DIR_LEFT]: "╯",
};

const SOLID_STRAIGHT_GLYPH: Record<number, string> = {
  [DIR_UP]: "│",
  [DIR_DOWN]: "│",
  [DIR_LEFT]: "─",
  [DIR_RIGHT]: "─",
  [DIR_UP | DIR_DOWN]: "│",
  [DIR_LEFT | DIR_RIGHT]: "─",
};

const DASHED_STRAIGHT_GLYPH: Record<number, string> = {
  [DIR_UP]: "┊",
  [DIR_DOWN]: "┊",
  [DIR_LEFT]: "┈",
  [DIR_RIGHT]: "┈",
  [DIR_UP | DIR_DOWN]: "┊",
  [DIR_LEFT | DIR_RIGHT]: "┈",
};

function glyphForDirections(mask: number, dashedOnly: boolean): string {
  const corner = CORNER_GLYPH[mask];
  if (corner) return corner;
  if (dashedOnly && DASHED_STRAIGHT_GLYPH[mask]) return DASHED_STRAIGHT_GLYPH[mask];
  const straight = SOLID_STRAIGHT_GLYPH[mask];
  if (straight) return straight;
  const up = (mask & DIR_UP) !== 0;
  const down = (mask & DIR_DOWN) !== 0;
  const left = (mask & DIR_LEFT) !== 0;
  const right = (mask & DIR_RIGHT) !== 0;
  if (up && down && right && !left) return "├";
  if (up && down && left && !right) return "┤";
  if (left && right && down && !up) return "┬";
  if (left && right && up && !down) return "┴";
  return "┼";
}

function stepBits(xStep: number, yStep: number): { forward: number; backward: number } {
  if (xStep > 0) return { forward: DIR_RIGHT, backward: DIR_LEFT };
  if (xStep < 0) return { forward: DIR_LEFT, backward: DIR_RIGHT };
  if (yStep > 0) return { forward: DIR_DOWN, backward: DIR_UP };
  return { forward: DIR_UP, backward: DIR_DOWN };
}

function arrow(from: { x: number; y: number }, to: { x: number; y: number }): string {
  return to.y > from.y ? "▼" : to.y < from.y ? "▲" : to.x > from.x ? "▶" : "◀";
}

function midpoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return previous ? Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) : 0;
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of lengths.entries()) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: Math.round(start.x + (end.x - start.x) * ratio),
        y: Math.round(start.y + (end.y - start.y) * ratio),
      };
    }
    remaining -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

function shouldPointFromStart(direction: string): boolean {
  return direction === "backward" || direction === "both";
}

function shouldPointToEnd(direction: string): boolean {
  return direction === "forward" || direction === "both";
}

export interface TerminalLayoutOptions {
  direction?: GraphDirection;
  spacing?: number;
  maxNodeWidth?: number;
}

/** Build the same character canvas the TUI consumes, without Node-only imports. */
export async function buildTerminalCanvas(
  view: GraphViewData,
  options: TerminalLayoutOptions = {},
): Promise<TerminalCanvas> {
  const graph = toGraphDocument(view);
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], lines: [], width: 0, height: 0 };
  }
  const geometry = await layoutTerminalGeometry(
    graph,
    options.direction ?? graph.direction ?? "DOWN",
    normalizedSpacing(options.spacing ?? 3),
    Math.max(MIN_NODE_WIDTH, options.maxNodeWidth ?? 32),
  );
  const canvas = renderCanvas(graph, geometry);
  const nodeStates: Record<string, NodeState> = { [view.root]: "running" };
  return {
    ...canvas,
    lines: renderTerminalCanvas(canvas, {
      color: false,
      nodeStates,
      /*
       * A static web snapshot has no animation loop, so orchgraph would keep
       * its first running frame, `◐` (U+25D0). Maple Mono NF CN does not cover
       * U+25D0: no `@font-face` block in the CDN stylesheet includes it, so the
       * browser falls back to a proportional system glyph whose advance is not
       * one cell and shifts the whole node label. `●` is in the Maple font and
       * is exactly one cell, so keep the root highlight without the shift.
       */
      runningFrames: ["●"],
    }),
  };
}
