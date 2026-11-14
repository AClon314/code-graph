/**
 * Root symbols for a project: the finite list shown by entry pickers and
 * shell completion. This is deliberately not "every symbol": cbm's
 * repository map can be large, and free-form QNs remain supported everywhere.
 */
import type { FetchLike } from "../cbm-endpoint.ts";
import {
  entryCandidates,
  fetchRepositoryNodes,
  type EntryCandidate,
  type RepositoryNode,
} from "./entries.ts";

export type RootKind = "entry" | "module" | "class";

export interface RootCandidate extends EntryCandidate {
  kind: RootKind;
}

export interface RootsCacheProject {
  roots: RootCandidate[];
  updatedAt?: string;
}

export interface RootsCache {
  version: 1;
  generatedAt: string;
  projects: Record<string, RootsCacheProject>;
}

/** Pick entry functions, module roots and exported classes, then rank them. */
export function rootCandidates(
  nodes: readonly RepositoryNode[],
  limit = 50,
): RootCandidate[] {
  const byQn = new Map<string, RootCandidate>();

  for (const candidate of entryCandidates(nodes, Math.max(limit * 3, 20))) {
    byQn.set(candidate.qualifiedName, { ...candidate, kind: "entry" });
  }

  for (const node of nodes) {
    const qualifiedName = node.qualified_name?.trim();
    const name = node.name?.trim();
    if (!qualifiedName || !name) continue;

    const reasons: string[] = [];
    let kind: RootKind | null = null;
    if (node.label === "Module" && isSourceModule(node)) {
      kind = "module";
      reasons.push("module");
      if (node.is_entry === true) reasons.push("cbm is_entry");
    } else if (
      node.label === "Class" &&
      (node.is_exported === true || node.is_entry === true)
    ) {
      kind = "class";
      reasons.push("class");
      if (node.is_entry === true) reasons.push("cbm is_entry");
      if (node.is_exported === true) reasons.push("exported");
    }
    if (!kind) continue;

    const existing = byQn.get(qualifiedName);
    if (existing) {
      existing.reason = uniqueReason(existing.reason + ", " + reasons.join(", "));
      continue;
    }
    byQn.set(qualifiedName, {
      qualifiedName,
      name,
      label: node.label ?? kind,
      filePath: node.file_path ?? "",
      startLine: node.start_line ?? 0,
      reason: reasons.join(", "),
      kind,
    });
  }

  return [...byQn.values()]
    .sort((left, right) => rootRank(left) - rootRank(right) || left.qualifiedName.localeCompare(right.qualifiedName))
    .slice(0, Math.max(0, limit));
}

/** Fetch root candidates from a local cbm repository map. */
export async function fetchRootCandidates(
  baseUrl: string,
  project: string,
  limit = 50,
  fetchImpl: FetchLike = fetch,
): Promise<RootCandidate[]> {
  return rootCandidates(
    await fetchRepositoryNodes(baseUrl, project, fetchImpl),
    limit,
  );
}

/** Parse a roots cache written by the CLI/entries command. */
export function parseRootsCache(text: string | null | undefined): RootsCache | null {
  if (!text || !text.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.projects)) return null;
  const projects: Record<string, RootsCacheProject> = {};
  for (const [project, value] of Object.entries(parsed.projects)) {
    if (!isRecord(value) || !Array.isArray(value.roots)) continue;
    const roots = value.roots.filter(isRootCandidate);
    projects[project] = {
      roots,
      ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
    };
  }
  return {
    version: 1,
    generatedAt:
      typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
    projects,
  };
}

/** Read roots for one project without throwing on a missing/corrupt cache. */
export function rootsForProject(
  text: string | null | undefined,
  project: string,
): RootCandidate[] {
  return parseRootsCache(text)?.projects[project]?.roots ?? [];
}

function isSourceModule(node: RepositoryNode): boolean {
  const path = node.file_path?.trim() ?? "";
  if (!path) return node.is_entry === true;
  return /\.(?:[cm]?[jt]sx?|svelte|vue|py|go|rs|java|kt|kts|c|cc|cpp|cxx|h|hpp|cs|rb|php|swift|scala|sh|bash|zsh|lua|dart)$/i.test(path);
}

function rootRank(candidate: RootCandidate): number {
  if (candidate.name === "main") return 0;
  if (candidate.kind === "module") return 1;
  if (candidate.reason.includes("cbm is_entry")) return 2;
  if (candidate.kind === "class") return 3;
  return 4;
}

function uniqueReason(value: string): string {
  return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))].join(", ");
}

function isRootCandidate(value: unknown): value is RootCandidate {
  if (!isRecord(value)) return false;
  return (
    typeof value.qualifiedName === "string" &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    typeof value.filePath === "string" &&
    typeof value.startLine === "number" &&
    typeof value.reason === "string" &&
    (value.kind === "entry" || value.kind === "module" || value.kind === "class")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
