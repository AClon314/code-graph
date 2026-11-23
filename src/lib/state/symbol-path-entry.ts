/**
 * Path-bar/state bridge: resolve a filesystem global symbol path to the
 * backend-qualified name consumed by GraphSource, without leaking this
 * conversion into App.svelte.
 */
import type { GraphUiState } from "./code-graph";
import { normalizeEntry } from "../graph/entry";
import {
  GlobalSymbolPath,
  globalSymbolPathFor,
  isGlobalSymbolPath,
  resolveGlobalSymbolPath,
  sameRootPath,
  type SymbolCandidate,
} from "../symbol-path";

export function pathForCandidate(
  candidate: SymbolCandidate,
  cwd: string,
  project = candidate.project ?? "",
): string {
  return globalSymbolPathFor(candidate, cwd, project).toString();
}

export function setPathToWorkspaceRoot(state: GraphUiState): void {
  // Keep an explicit `project//` selection; otherwise fall back to the cwd.
  if (state.setup.path.endsWith("//") && !state.setup.path.startsWith("/")) return;
  state.setup.path = state.setup.workspaceRoot || state.setup.path;
}

export function pathCandidates(state: GraphUiState): SymbolCandidate[] {
  const detail = state.current.detail.symbol;
  const project = state.setup.project;
  return [
    ...(state.current.graph?.nodes ?? []),
    ...state.setup.roots,
    ...(detail ? [detail.node, ...detail.callers, ...detail.callees] : []),
  ].map((candidate) => ({ ...candidate, project }));
}

/** Resolve path-bar text to the current graph's qualified name. */
export function folderEntryPath(state: GraphUiState, value: string): string | null {
  const text = value.trim();
  if (!isGlobalSymbolPath(text)) return null;
  const path = new GlobalSymbolPath(text, state.setup.workspaceRoot);
  if (path.hasFile || path.project) return null;
  return path.folder || null;
}

export function resolveEntryPath(
  state: GraphUiState,
  value: string,
): SymbolCandidate | null {
  const text = value.trim();
  if (!text) return null;
  const legacy = normalizeEntry(text);
  if (legacy?.startsWith("#")) return { qualifiedName: legacy };
  if (isGlobalSymbolPath(text)) {
    const path = new GlobalSymbolPath(text, state.setup.workspaceRoot);
    if (
      path.project &&
      state.setup.projectRows.length > 0 &&
      !state.setup.projectRows.some((project) => project.name === path.project)
    ) {
      return null;
    }
    if (!path.hasFile) {
      if (path.project) return { qualifiedName: "", project: path.project };
      const row = state.setup.projectRows.find((project) =>
        sameRootPath(project.rootPath, path.folder),
      );
      return row
        ? { qualifiedName: "", project: row.name, rootPath: row.rootPath }
        : { qualifiedName: "", rootPath: path.folder };
    }
    const location = /^L(\d+)C(\d+)$/.exec(path.symbol);
    if (location) {
      const fileCandidates = pathCandidates(state).filter(
        (candidate) =>
          globalSymbolPathFor(candidate, state.setup.workspaceRoot, candidate.project).file === path.file,
      );
      return (
        fileCandidates.find(
          (candidate) =>
            candidate.startLine === Number(location[1]) &&
            candidate.startColumn === Number(location[2]),
        ) ??
        fileCandidates[0] ??
        null
      );
    }
    return resolveGlobalSymbolPath(path, pathCandidates(state));
  }
  return legacy ? { qualifiedName: legacy } : null;
}

/**
 * Apply one path-bar commit. Returns an error message (and leaves state
 * unchanged) when the input cannot be resolved.
 */
export function applyEntryPath(state: GraphUiState, value: string): string | null {
  const text = value.trim();
  if (!text) {
    state.setup.entry = "";
    state.setup.refProject = state.setup.project;
    setPathToWorkspaceRoot(state);
    return null;
  }

  const resolved = resolveEntryPath(state, text);
  if (!resolved) {
    return isGlobalSymbolPath(text)
      ? `No symbol matches ${text}`
      : `Invalid symbol path: ${text}`;
  }

  if (resolved.project) {
    state.setup.project = resolved.project;
    state.setup.refProject = resolved.project;
  }
  state.setup.entry = resolved.qualifiedName;
  state.setup.refProject = state.setup.project;
  state.setup.path = resolved.qualifiedName
    ? pathForCandidate(resolved, state.setup.workspaceRoot, state.setup.project)
    : resolved.project
      ? `${resolved.project}//`
      : state.setup.workspaceRoot;
  return null;
}
