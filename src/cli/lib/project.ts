import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  backendConfig,
  loadProjectConfig,
  type ProjectConfig,
} from "../../lib/config.ts";
import type { ConfigBackend } from "../../lib/config.ts";

export interface ResolvedProject {
  backend: ConfigBackend;
  root: string;
  project: string;
  symbolEntry?: string;
}

/** Load the team/personal project config without creating a file. */
export async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const loaded = await loadProjectConfig(root, (path) =>
    existsSync(path) ? readFileSync(path, "utf8") : null,
  );
  return loaded.config;
}

/**
 * Resolve one backend's project. Explicit CLI flags win, then the workspace
 * config, then the CLI's stable default names.
 */
export async function resolveProject(
  root: string,
  backend: ConfigBackend,
  explicitProject?: string,
  explicitSymbolEntry?: string,
): Promise<ResolvedProject> {
  const config = await readProjectConfig(root);
  const resolved = backendConfig(config, backend);
  const defaultProject =
    backend === "scip" ? `${basename(root)}-scip` : basename(root);

  return {
    backend,
    root: resolve(root),
    project: explicitProject || resolved.project || defaultProject,
    symbolEntry: explicitSymbolEntry || resolved.symbolEntry || undefined,
  };
}
