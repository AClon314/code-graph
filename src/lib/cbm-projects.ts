import type { CbmHttpRequest, CbmHttpResponse } from "./cbm-request";
import { toUnixPath } from "./symbol-path";

export type CbmFetch = (
  request: CbmHttpRequest,
) => Promise<CbmHttpResponse>;

export interface CbmProject {
  name: string;
  rootPath: string;
  branch: string;
}

/**
 * Parse the compact text returned by cbm's `list_projects` tool.
 *
 * The tool emits a small table:
 *   projects: 9  (cols: name root_path branch)
 *     project-a @0+root main
 *     project-b /absolute/root -
 *   total: 9
 *
 * `root_path` may contain spaces, so the branch is the last token and the
 * middle is joined back into the root path.
 */
export function parseCbmProjectRows(text: string): CbmProject[] {
  const lines = text.split(/\r?\n/);
  const projects: CbmProject[] = [];
  const seen = new Set<string>();
  let inProjects = false;

  for (const line of lines) {
    if (/^\s*projects:\s*\d+/.test(line)) {
      inProjects = true;
      continue;
    }
    if (!inProjects) continue;
    if (/^\s*(total|returned|has_more):/.test(line)) break;
    if (!line.startsWith("  ")) continue;
    const parts = line.trim().split(/\s+/);
    const name = parts[0];
    if (!name || seen.has(name)) continue;
    const branch = parts.length > 2 ? parts.at(-1) ?? "" : "";
    const rootPath = parts.slice(1, parts.length > 2 ? -1 : undefined).join(" ");
    seen.add(name);
    projects.push({ name, rootPath, branch });
  }
  return projects;
}

export function parseCbmProjects(text: string): string[] {
  return parseCbmProjectRows(text).map((project) => project.name);
}

async function fetchCbmProjectText(fetchCbm: CbmFetch): Promise<string> {
  const response = await fetchCbm({
    path: "/rpc",
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_projects", arguments: {} },
    }),
  });
  if (response.status !== 200 || !response.body) return "";
  try {
    const payload: unknown = JSON.parse(response.body);
    if (!isRecord(payload) || !isRecord(payload.result)) return "";
    const content = payload.result.content;
    if (!Array.isArray(content)) return "";
    const part = content.find(
      (item): item is { type: "text"; text: string } =>
        isRecord(item) && item.type === "text" && typeof item.text === "string",
    );
    return part?.text ?? "";
  } catch {
    return "";
  }
}

/** Fetch project names, root paths and branches through cbm's read-only RPC. */
export async function fetchCbmProjectRows(
  fetchCbm: CbmFetch,
): Promise<CbmProject[]> {
  return parseCbmProjectRows(await fetchCbmProjectText(fetchCbm));
}

/** Fetch indexed project names through cbm's read-only JSON-RPC endpoint. */
export async function fetchCbmProjects(fetchCbm: CbmFetch): Promise<string[]> {
  return (await fetchCbmProjectRows(fetchCbm)).map((project) => project.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface CbmProjectHealth {
  name: string;
  status: "healthy" | "missing" | "corrupt";
  indexedAt: string | null;
  nodes: number;
  edges: number;
  sizeBytes: number;
}

/** Read project freshness from the cbm HTTP health endpoint. */
export async function fetchCbmProjectHealth(
  fetchCbm: CbmFetch,
  name: string,
): Promise<CbmProjectHealth | null> {
  const response = await fetchCbm({
    path: "/api/project-health",
    query: { name },
  });
  if (response.status !== 200) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;
  return {
    name,
    status:
      payload.status === "healthy" || payload.status === "missing" || payload.status === "corrupt"
        ? payload.status
        : "corrupt",
    indexedAt: typeof payload.indexed_at === "string" ? payload.indexed_at : null,
    nodes: typeof payload.nodes === "number" ? payload.nodes : 0,
    edges: typeof payload.edges === "number" ? payload.edges : 0,
    sizeBytes: typeof payload.size_bytes === "number" ? payload.size_bytes : 0,
  };
}

/** Delete through the UI's mutation route; `/rpc` only exposes read tools. */
export async function deleteCbmProjectViaApi(
  fetchCbm: CbmFetch,
  project: string,
): Promise<void> {
  const response = await fetchCbm({
    path: "/api/project",
    query: { name: project },
    method: "DELETE",
  });
  if (response.status !== 200) {
    throw new Error(`delete ${project}: HTTP ${response.status} ${response.body.slice(0, 300)}`);
  }
}

/** Return project rows whose `indexed_at` is older than the day cutoff. */
export async function staleCbmProjects(
  fetchCbm: CbmFetch,
  days: number,
  now = Date.now(),
): Promise<CbmProject[]> {
  if (!Number.isInteger(days) || days < 0) throw new Error("days must be zero or a positive integer");
  const rows = await fetchCbmProjectRows(fetchCbm);
  if (days === 0) return rows;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const stale: CbmProject[] = [];
  for (const row of rows) {
    const health = await fetchCbmProjectHealth(fetchCbm, row.name);
    if (!health?.indexedAt) continue;
    const updated = Date.parse(health.indexedAt);
    if (Number.isFinite(updated) && updated < cutoff) stale.push(row);
  }
  return stale;
}

/**
 * Port of cbm's `cbm_project_name_from_path` for the UI's folder-index path.
 * Keeps safe ASCII, maps other ASCII to '-', non-ASCII UTF-8 bytes to hex,
 * collapses repeated '-'/'.', trims leading separators and trailing '-'.
 */
export function cbmProjectNameFromPath(path: string): string {
  const normalized = toUnixPath(path).replace(/\/+$/, "");
  if (!normalized || /^[/\\:]+$/.test(path)) return "root";
  let mapped = "";
  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      mapped += /[A-Za-z0-9._-]/.test(character) ? character : "-";
    } else {
      for (const byte of new TextEncoder().encode(character)) {
        mapped += byte.toString(16).padStart(2, "0");
      }
    }
  }
  mapped = mapped.replace(/-{2,}/g, "-").replace(/\.{2,}/g, ".");
  mapped = mapped.replace(/^[-.]+/, "").replace(/-+$/, "");
  return mapped || "root";
}
