import type { RootCandidate } from "./roots";
import type { GraphViewData, GraphViewNode } from "./types";

/** One canvas containing every root candidate; used when the path bar is empty. */
export function rootsOverview(roots: readonly RootCandidate[]): GraphViewData {
  const seen = new Set<string>();
  const nodes: GraphViewNode[] = [];
  for (const root of roots) {
    if (!root.qualifiedName || seen.has(root.qualifiedName)) continue;
    seen.add(root.qualifiedName);
    nodes.push({
      id: root.qualifiedName,
      label: root.label,
      name: root.name,
      qualifiedName: root.qualifiedName,
      filePath: root.filePath || undefined,
      startLine: root.startLine || undefined,
      isEntry: root.kind === "entry" || undefined,
    });
  }
  return { root: "", nodes, edges: [], truncated: false };
}
