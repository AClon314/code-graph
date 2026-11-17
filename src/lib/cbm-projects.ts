import type { CbmHttpRequest, CbmHttpResponse } from "./cbm-request";

export type CbmFetch = (
  request: CbmHttpRequest,
) => Promise<CbmHttpResponse>;

/**
 * Parse the compact text returned by cbm's `list_projects` tool.
 *
 * The tool emits a small table:
 *   projects: 9  (cols: name root_path branch)
 *     project-a @0+root main
 *     project-b /absolute/root -
 *   total: 9
 */
export function parseCbmProjects(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const projects: string[] = [];
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
    const name = line.trim().split(/\s+/, 1)[0];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    projects.push(name);
  }
  return projects;
}

/** Fetch indexed project names through cbm's read-only JSON-RPC endpoint. */
export async function fetchCbmProjects(
  fetchCbm: CbmFetch,
): Promise<string[]> {
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
  if (response.status !== 200 || !response.body) return [];

  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return [];
  }
  if (!isRecord(payload) || !isRecord(payload.result)) return [];
  const content = payload.result.content;
  if (!Array.isArray(content)) return [];
  const part = content.find(
    (item): item is { type: "text"; text: string } =>
      isRecord(item) && item.type === "text" && typeof item.text === "string",
  );
  return part ? parseCbmProjects(part.text) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
