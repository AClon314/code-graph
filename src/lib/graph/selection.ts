import type { GraphViewData, GraphViewEdge, GraphViewNode } from "./types";

export interface RelatedSelection {
  nodes: Set<string>;
  edges: Set<string>;
}

/**
 * Nodes that participate in the selected node's call paths: transitive
 * callers (ancestors) and callees (descendants), not every node in the
 * undirected component. This keeps a sibling branch out of focus mode instead
 * of treating "shares the root" as related.
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

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, from: string, to: string): void => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const edge of data.edges) {
    add(forward, edge.source, edge.target);
    add(backward, edge.target, edge.source);
  }

  const walk = (adjacency: Map<string, string[]>): void => {
    const queue = [selectedId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (nodes.has(next)) continue;
        nodes.add(next);
        queue.push(next);
      }
    }
  };
  nodes.add(selectedId);
  walk(forward);
  walk(backward);

  for (const edge of data.edges) {
    if (nodes.has(edge.source) && nodes.has(edge.target)) edges.add(edge.id);
  }
  return { nodes, edges };
}

/**
 * The selected node's ancestor/descendant paths, preserving edge order and the
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
