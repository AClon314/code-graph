import type { GraphViewData, GraphViewNode } from "./types";

/** Node ids whose name or qualified name contains the query. */
export function graphSearchHits(
  data: GraphViewData | null,
  query: string,
): Set<string> {
  const needle = query.trim().toLowerCase();
  const hits = new Set<string>();
  if (!needle || !data) return hits;
  for (const node of data.nodes) {
    if (
      node.name.toLowerCase().includes(needle) ||
      node.qualifiedName.toLowerCase().includes(needle)
    ) {
      hits.add(node.id);
    }
  }
  return hits;
}

/** Matching nodes in graph order; the search counter navigates this list. */
export function graphSearchResultNodes(
  data: GraphViewData | null,
  hits: Set<string>,
): GraphViewNode[] {
  if (!data) return [];
  return data.nodes.filter((node) => hits.has(node.id));
}

/** Next/previous result with wrap-around; -1 means "no selection yet". */
export function stepSearchIndex(index: number, total: number, delta: number): number {
  if (total <= 0) return -1;
  if (index < 0 || index >= total) return delta < 0 ? total - 1 : 0;
  return (index + delta + total) % total;
}
