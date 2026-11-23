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
  type SymbolCandidate,
} from "../symbol-path";

export function pathForCandidate(candidate: SymbolCandidate, cwd: string): string {
  return globalSymbolPathFor(candidate, cwd).toString();
}

export function setPathToWorkspaceRoot(state: GraphUiState): void {
  state.setup.path = state.setup.workspaceRoot || state.setup.path;
}

export function pathCandidates(state: GraphUiState): SymbolCandidate[] {
  const detail = state.current.detail.symbol;
  return [
    ...(state.current.graph?.nodes ?? []),
    ...state.setup.roots,
    ...(detail ? [detail.node, ...detail.callers, ...detail.callees] : []),
  ];
}

/** Resolve path-bar text to the current graph's qualified name. */
export function resolveEntryPath(
  state: GraphUiState,
  value: string,
): SymbolCandidate | null {
  const text = value.trim();
  if (!text) return null;
  if (isGlobalSymbolPath(text)) {
    const path = new GlobalSymbolPath(text, state.setup.workspaceRoot);
    if (!path.hasFile) return { qualifiedName: "" };
    const location = /^L(\d+)C(\d+)$/.exec(path.symbol);
    if (location) {
      const fileCandidates = pathCandidates(state).filter(
        (candidate) =>
          globalSymbolPathFor(candidate, state.setup.workspaceRoot).file === path.file,
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
  const normalized = normalizeEntry(text);
  return normalized ? { qualifiedName: normalized } : null;
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

  state.setup.entry = resolved.qualifiedName;
  state.setup.refProject = state.setup.project;
  state.setup.path = resolved.qualifiedName
    ? pathForCandidate(resolved, state.setup.workspaceRoot)
    : state.setup.workspaceRoot;
  return null;
}
