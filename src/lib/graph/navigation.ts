import type { GraphViewData, GraphViewNode } from "./types";

export type NeighborDirection = "callers" | "callees";

/** First direct caller/callee in graph order. */
export function firstNeighbor(
  data: GraphViewData,
  nodeId: string,
  direction: NeighborDirection,
): GraphViewNode | undefined {
  const ids = new Set<string>();
  for (const edge of data.edges) {
    if (direction === "callers" && edge.target === nodeId && edge.source !== nodeId) {
      ids.add(edge.source);
    }
    if (direction === "callees" && edge.source === nodeId && edge.target !== nodeId) {
      ids.add(edge.target);
    }
  }
  return data.nodes.find((node) => ids.has(node.id));
}

/**
 * Siblings are nodes reached by the same first caller. Root nodes (no caller)
 * share the empty parent slot, so they are siblings of each other too.
 */
export function siblingNodes(data: GraphViewData, nodeId: string): GraphViewNode[] {
  const node = data.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return [];
  const parent = firstNeighbor(data, nodeId, "callers")?.id ?? "";
  return data.nodes.filter((candidate) => {
    const candidateParent = firstNeighbor(data, candidate.id, "callers")?.id ?? "";
    return candidateParent === parent;
  });
}

/** Adjacent sibling in stable graph order; no wrap-around. */
export function adjacentSibling(
  data: GraphViewData,
  nodeId: string,
  offset: -1 | 1,
): GraphViewNode | undefined {
  const siblings = siblingNodes(data, nodeId);
  const index = siblings.findIndex((node) => node.id === nodeId);
  return index < 0 ? undefined : siblings[index + offset];
}

/** Pure helper behind the callers/callees/sibling keyboard navigation. */
export function navigationTarget(
  graph: GraphViewData,
  currentId: string,
  direction: "callers" | "callees" | "sibling",
  offset = 1,
): GraphViewNode | undefined {
  return direction === "sibling"
    ? adjacentSibling(graph, currentId, offset < 0 ? -1 : 1)
    : firstNeighbor(graph, currentId, direction);
}

/** Match a pending URL location against the freshly loaded nodes. */
export function matchLocation<T extends { filePath?: string; startLine?: number }>(
  nodes: readonly T[],
  location: { file: string; line: number } | null,
): T | undefined {
  if (!location) return undefined;
  return nodes.find((node) => node.filePath === location.file && node.startLine === location.line);
}
