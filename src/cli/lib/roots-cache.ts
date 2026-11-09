import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { FetchLike } from "../../lib/cbm-endpoint.ts";
import { dirname } from "node:path";

import { rootsCachePath } from "../../lib/graph/cache.ts";
import { fetchRootCandidates, parseRootsCache, type RootCandidate, type RootsCache } from "../../lib/graph/roots.ts";
import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";

export interface RefreshRootsOptions {
  root: string;
  project: string;
  cbm?: string;
  limit?: number;
  fetchImpl?: FetchLike;
}

/** Read the per-workspace roots cache, returning an empty cache on errors. */
export function readRootsCache(root: string): RootsCache {
  const path = rootsCachePath(root);
  if (!existsSync(path)) {
    return { version: 1, generatedAt: "", projects: {} };
  }
  try {
    return parseRootsCache(readFileSync(path, "utf8")) ?? {
      version: 1,
      generatedAt: "",
      projects: {},
    };
  } catch {
    return { version: 1, generatedAt: "", projects: {} };
  }
}

/** Merge roots for one project and atomically replace roots.json. */
export function writeRootsCache(
  root: string,
  project: string,
  roots: RootCandidate[],
): string {
  const path = rootsCachePath(root);
  const current = readRootsCache(root);
  const now = new Date().toISOString();
  current.version = 1;
  current.generatedAt = now;
  current.projects[project] = { roots, updatedAt: now };
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(current, null, 2) + "\n");
  renameSync(temporary, path);
  return path;
}

/** Fetch roots from cbm and write them to the workspace cache. */
export async function refreshRootsCache(
  options: RefreshRootsOptions,
): Promise<RootCandidate[]> {
  const endpoint = await resolveCbmBaseUrl(options.cbm, options.fetchImpl);
  const roots = await fetchRootCandidates(
    endpoint.baseUrl,
    options.project,
    options.limit ?? 80,
    options.fetchImpl,
  );
  writeRootsCache(options.root, options.project, roots);
  return roots;
}
