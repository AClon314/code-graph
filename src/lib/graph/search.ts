import type { GraphViewData } from "./types";

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
