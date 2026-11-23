/** Setup/path-bar actions that mutate the central UI state. */
import type { ExtensionConfig } from "../../extension/api";
import type { CbmFetch } from "../cbm-projects";
import type { GraphUiState } from "../state/code-graph";
import {
  applyEntryPath,
  folderEntryPath,
} from "../state/symbol-path-entry";
import { projectForRoot } from "../graph/loaders";
import {
  deleteStaleProjects as deleteStaleProjectsAction,
  indexCbmFolder,
} from "./projects";

/** Copy host config into the JSON-safe setup state. */
export function applyExtensionConfig(
  state: GraphUiState,
  config: ExtensionConfig,
): void {
  state.setup.backend = config.backend;
  if (config.source === "computed" || config.source === "cbm") {
    state.setup.source = config.source;
  }
  state.setup.cbmBaseUrl = config.cbmBaseUrl;
  state.setup.workspaceRoot = config.workspaceRoot;
  if (!state.setup.path) state.setup.path = config.workspaceRoot;
  state.setup.configPath = config.configPath;
  state.setup.cssPath = config.cssPath;
  state.setup.nodeRendererPath = config.nodeRendererPath;
  state.setup.globalConfigPath = config.globalConfigPath;
  state.setup.globalCssPath = config.globalCssPath;
  state.setup.globalRendererPath = config.globalRendererPath;
}

/** Commit path-bar text to a project/folder or symbol; returns an error text. */
export async function commitSetupPath(
  state: GraphUiState,
  value: string,
  fetchCbm: CbmFetch,
  refresh: () => Promise<void>,
): Promise<string | null> {
  const folder = folderEntryPath(state, value);
  if (folder) {
    if (state.setup.source !== "cbm") {
      return "Folder indexing needs the cbm source";
    }
    const indexed = projectForRoot(state.setup.projectRows, folder);
    if (indexed) {
      state.setup.project = indexed.name;
      state.setup.refProject = indexed.name;
      state.setup.entry = "";
      state.setup.path = `${indexed.name}//`;
      state.current.status.action = `Switched to ${indexed.name}`;
      await refresh();
      return null;
    }
    state.current.status.action = `Indexing ${folder}…`;
    try {
      const project = await indexCbmFolder(fetchCbm, folder);
      state.setup.project = project;
      state.setup.refProject = project;
      state.setup.entry = "";
      state.setup.path = `${project}//`;
      state.current.status.action = `Indexed ${project}`;
      await refresh();
      return null;
    } catch (cause) {
      state.current.status.action = "";
      return `Index failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  const error = applyEntryPath(state, value);
  if (error) return error;
  await refresh();
  return null;
}

/** Delete projects older than `days`, then refresh the project/graph. */
export async function deleteStaleProjects(
  state: GraphUiState,
  fetchCbm: CbmFetch,
  days: number,
  refresh: () => Promise<void>,
): Promise<void> {
  const current = state.setup.project;
  const deleted = await deleteStaleProjectsAction(fetchCbm, days);
  const currentDeleted = deleted.includes(current);
  if (currentDeleted) {
    state.setup.entry = "";
    state.setup.path = state.setup.workspaceRoot;
  }
  state.current.status.action = deleted.length
    ? `Deleted ${deleted.length} stale project${deleted.length === 1 ? "" : "s"}`
    : "No projects older than the cutoff";
  await refresh();
  if (currentDeleted) {
    state.setup.project =
      projectForRoot(state.setup.projectRows, state.setup.workspaceRoot)?.name ??
      state.setup.projectRows[0]?.name ??
      "";
    state.setup.refProject = state.setup.project;
    await refresh();
  }
}
