import { fetchCbmProjects, type CbmFetch } from "../cbm-projects.ts";
import type { FetchLike } from "../cbm-endpoint.ts";
import { fetchRootCandidates, type RootCandidate } from "./roots.ts";
import { COMPUTED_ROOTS } from "./computed.ts";
import { SOURCE_DEFAULTS, type SourceKind } from "./url-state.ts";
import type { GraphUiState } from "../state/code-graph.ts";

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
  return fetchCbmProjects(fetchCbm);
}

/** Fetch project names into the shell state, including the loading/error UI. */
export async function loadProjectNames(
  state: GraphUiState,
  fetchCbm: CbmFetch,
): Promise<void> {
  state.setup.loading.projects = true;
  try {
    state.setup.projects = await fetchProjectsFor(state.setup.source, fetchCbm);
  } catch (cause) {
    state.setup.projects = [];
    console.warn("[code-graph] could not load cbm projects", cause);
  } finally {
    state.setup.loading.projects = false;
  }
}
