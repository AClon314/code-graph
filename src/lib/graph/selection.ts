import type { GraphViewData, GraphViewEdge, GraphViewNode } from "./types";

export interface RelatedSelection {
  nodes: Set<string>;
  edges: Set<string>;
}

/**
 * Nodes reachable from `selectedId` when edges are treated as undirected.
 *
 * The graph is a call graph, but "related" in the UI means connected in either
 * direction: callers, callees and their transitive neighbours all stay lit.
 */
export function relatedSelection(
  data: GraphViewData,
  selectedId: string,
): RelatedSelection {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!selectedId || !data.nodes.some((node) => node.id === selectedId)) {
    return { nodes, edges };
  }

  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const edge of data.edges) {
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }

  const queue = [selectedId];
  nodes.add(selectedId);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (nodes.has(next)) continue;
      nodes.add(next);
      queue.push(next);
    }
  }

  for (const edge of data.edges) {
    if (nodes.has(edge.source) && nodes.has(edge.target)) edges.add(edge.id);
  }
  return { nodes, edges };
}

/**
 * The selected node's connected component, preserving edge order and the
 * original root/truncated flags. Used by the "focus only" re-layout.
 */
export function focusSubgraph(data: GraphViewData, selectedId: string): GraphViewData {
  const related = relatedSelection(data, selectedId);
  if (related.nodes.size === 0) return data;
  return {
    root: data.root,
    nodes: data.nodes.filter((node) => related.nodes.has(node.id)),
    edges: data.edges.filter((edge) => related.edges.has(edge.id)),
    truncated: data.truncated,
  };
}

/** Stable class tokens for third-party theme authors. */
export function nodeRelationshipClass(
  node: GraphViewNode,
  selection: RelatedSelection | null,
): string {
  return selection === null ? "" : selection.nodes.has(node.id) ? "is-related" : "is-unrelated";
}

export function edgeRelationshipClass(
  edge: GraphViewEdge,
  selection: RelatedSelection | null,
): string {
  return selection === null ? "" : selection.edges.has(edge.id) ? "is-related" : "is-unrelated";
}
