import {
  fetchCbmProjectRows,
  type CbmFetch,
  type CbmProject,
} from "../cbm-projects.ts";
import type { FetchLike } from "../cbm-endpoint.ts";
import { fetchRootCandidates, type RootCandidate } from "./roots.ts";
import { COMPUTED_ROOTS } from "./computed.ts";
import { SOURCE_DEFAULTS, type SourceKind } from "./url-state.ts";
import type { GraphUiState } from "../state/code-graph.ts";
import { sameRootPath } from "../symbol-path.ts";

export async function fetchRootsFor(
  kind: SourceKind,
  baseUrl: string,
  project: string,
  fetchImpl?: FetchLike,
): Promise<RootCandidate[]> {
  if (kind !== "cbm") return COMPUTED_ROOTS;
  return fetchRootCandidates(baseUrl, project, 200, fetchImpl);
}

export async function fetchProjectsFor(
  kind: SourceKind,
  fetchCbm: CbmFetch,
): Promise<string[]> {
  if (kind !== "cbm") return [SOURCE_DEFAULTS.computed.project];
  return (await fetchCbmProjectRows(fetchCbm)).map((project) => project.name);
}


/**
 * Pick the unique indexed project whose root is the current workspace. If the
 * same root has multiple indexes, leave the current choice to the path bar.
 */
export function projectForRoot(
  rows: readonly CbmProject[],
  workspaceRoot: string,
): CbmProject | null {
  if (!workspaceRoot.trim()) return null;
  const matches = rows.filter((row) => sameRootPath(row.rootPath, workspaceRoot));
  return matches.length === 1 ? matches[0] ?? null : null;
}

/** Fetch project names into the shell state, including the loading/error UI. */
export async function loadProjectNames(
  state: GraphUiState,
  fetchCbm: CbmFetch,
  autoSelect = false,
): Promise<void> {
  state.setup.loading.projects = true;
  try {
    state.setup.projectRows =
      state.setup.source === "cbm" ? await fetchCbmProjectRows(fetchCbm) : [];
    state.setup.projects = state.setup.projectRows.map((project) => project.name);
    if (state.setup.source !== "cbm") {
      state.setup.projects = [SOURCE_DEFAULTS.computed.project];
    }
    const match = autoSelect
      ? projectForRoot(state.setup.projectRows, state.setup.workspaceRoot)
      : null;
    if (match && match.name !== state.setup.project) {
      state.setup.project = match.name;
      state.setup.refProject = match.name;
    }
  } catch (cause) {
    state.setup.projects = [];
    state.setup.projectRows = [];
    console.warn("[code-graph] could not load cbm projects", cause);
  } finally {
    state.setup.loading.projects = false;
  }
}
