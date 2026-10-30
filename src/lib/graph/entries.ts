/**
 * Entry-point candidates from a cbm repository map.
 *
 * cbm's `is_entry_point` flag is deliberately heuristic (a symbol named
 * `main`, exported JS/TS functions, Make targets). Treat these as candidates
 * for an explicit selection, never as a claim that the repository has one
 * unique entry.
 */

export interface RepositoryNode {
  name?: string;
  label?: string;
  qualified_name?: string;
  file_path?: string;
  start_line?: number;
  is_entry?: boolean;
  is_exported?: boolean;
}

export interface EntryCandidate {
  qualifiedName: string;
  name: string;
  label: string;
  filePath: string;
  startLine: number;
  reason: string;
}

const ENTRY_LABELS = new Set(["Function", "Method", "Constructor"]);

export function entryCandidates(
  nodes: readonly RepositoryNode[],
  limit = 20,
): EntryCandidate[] {
  const seen = new Set<string>();
  const result: EntryCandidate[] = [];

  for (const node of nodes) {
    const qualifiedName = node.qualified_name?.trim();
    const name = node.name?.trim();
    if (!qualifiedName || !name) continue;
    if (!ENTRY_LABELS.has(node.label ?? "")) continue;
    if (seen.has(qualifiedName)) continue;

    const reasons: string[] = [];
    if (node.is_entry === true) reasons.push("cbm is_entry");
    if (name === "main") reasons.push("name main");
    if (node.is_exported === true) reasons.push("exported");
    if (reasons.length === 0) continue;

    seen.add(qualifiedName);
    result.push({
      qualifiedName,
      name,
      label: node.label ?? "Function",
      filePath: node.file_path ?? "",
      startLine: node.start_line ?? 0,
      reason: reasons.join(", "),
    });
  }

  return result
    .sort((a, b) => {
      const aMain = a.name === "main" ? 0 : 1;
      const bMain = b.name === "main" ? 0 : 1;
      return aMain - bMain || a.qualifiedName.localeCompare(b.qualifiedName);
    })
    .slice(0, Math.max(0, limit));
}
