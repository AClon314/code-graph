/**
 * cbm's folder-index routes, shared by every host.
 *
 * The browser reaches these through Vite's `/api` proxy, VS Code through its
 * extension-host fetch proxy, and Fresh through its local listener. None of
 * the hosts needs its own index implementation: they all expose `fetchCbm`.
 */
import type { CbmFetch } from "./cbm-projects.ts";

export interface CbmIndexStarted {
  slot: number;
  path: string;
}

export type CbmIndexStatus = "indexing" | "done" | "error" | "unknown";

export interface CbmIndexJob {
  slot: number;
  status: CbmIndexStatus;
  path: string;
  error: string;
}

export interface CbmBrowseLevel {
  path: string;
  dirs: string[];
  parent: string;
  roots: string[];
}

/** Start a background `POST /api/index` job for one repository folder. */
export async function startCbmIndex(
  fetchCbm: CbmFetch,
  rootPath: string,
  projectName: string,
): Promise<CbmIndexStarted> {
  const root = rootPath.trim();
  const project = projectName.trim();
  if (!root) throw new Error("repository folder is required");
  if (!project) throw new Error("project name is required");
  const response = await fetchCbm({
    path: "/api/index",
    method: "POST",
    body: JSON.stringify({ root_path: root, project_name: project }),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`index ${project}: HTTP ${response.status} ${response.body.slice(0, 300)}`);
  }
  const payload = parseObject(response.body, "index");
  return {
    slot: typeof payload.slot === "number" ? payload.slot : -1,
    path: typeof payload.path === "string" ? payload.path : root,
  };
}

/** Read the server's in-memory index job table. */
export async function fetchCbmIndexJobs(fetchCbm: CbmFetch): Promise<CbmIndexJob[]> {
  const response = await fetchCbm({ path: "/api/index-status" });
  if (response.status !== 200) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return [];
  }
  if (!Array.isArray(payload)) return [];
  return payload.filter(isRecord).map((job) => ({
    slot: typeof job.slot === "number" ? job.slot : -1,
    status:
      job.status === "indexing" || job.status === "done" || job.status === "error"
        ? job.status
        : "unknown",
    path: typeof job.path === "string" ? job.path : "",
    error: typeof job.error === "string" ? job.error : "",
  }));
}

/** List directories under `path` for the folder picker; empty starts at roots. */
export async function browseCbmFolders(
  fetchCbm: CbmFetch,
  path = "",
): Promise<CbmBrowseLevel> {
  const response = await fetchCbm({
    path: "/api/browse",
    query: path.trim() ? { path: path.trim() } : undefined,
  });
  if (response.status !== 200) {
    throw new Error(`browse ${path || "roots"}: HTTP ${response.status} ${response.body.slice(0, 300)}`);
  }
  const payload = parseObject(response.body, "browse");
  return {
    path: typeof payload.path === "string" ? payload.path : path,
    dirs: strings(payload.dirs),
    parent: typeof payload.parent === "string" ? payload.parent : "",
    roots: strings(payload.roots),
  };
}

function parseObject(body: string, context: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body);
    if (isRecord(value)) return value;
  } catch {
    // Fall through to the descriptive error below.
  }
  throw new Error(`${context}: unexpected server response`);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
