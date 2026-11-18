import { execFileSync } from "node:child_process";

import { fetchCbmProjects } from "../../lib/cbm-projects.ts";
import { requestCbm } from "../../lib/cbm-request.ts";
import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";

export interface CbmProjectOptions {
  cbm?: string;
}

/** List cbm projects through the read-only JSON-RPC tool. */
export async function listCbmProjects(options: CbmProjectOptions = {}): Promise<string[]> {
  const endpoint = await resolveCbmBaseUrl(options.cbm);
  assertLoopback(endpoint.baseUrl);
  const response = await requestCbm(endpoint.baseUrl, {
    path: "/rpc",
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_projects", arguments: {} },
    }),
  }, { timeoutMs: 10_000 });
  if (response.status !== 200) {
    throw new Error(`list projects: HTTP ${response.status} ${response.body.slice(0, 300)}`);
  }
  if (!response.body.includes("projects:")) {
    throw new Error("list projects: the listener returned no project table");
  }
  return fetchCbmProjects(async () => response);
}

function assertLoopback(baseUrl: string): URL {
  const base = new URL(baseUrl);
  const local =
    base.hostname === "127.0.0.1" ||
    base.hostname === "localhost" ||
    base.hostname === "[::1]" ||
    base.hostname === "::1";
  if (!local) {
    throw new Error(`refusing to use non-loopback cbm: ${base.origin}`);
  }
  return base;
}

/** Resolve and validate the loopback cbm target for a destructive action. */
export async function cbmTarget(options: CbmProjectOptions = {}): Promise<string> {
  if (!options.cbm) return "local daemon";
  const endpoint = await resolveCbmBaseUrl(options.cbm);
  return assertLoopback(endpoint.baseUrl).origin;
}

/** Delete one project and its cbm database. */
export async function deleteCbmProject(
  name: string,
  options: CbmProjectOptions = {},
): Promise<void> {
  if (!name.trim()) throw new Error("project name is required");

  // The cbm MCP delete path also removes the ADR sidecar; use it for the
  // default local daemon. An explicit --cbm URL uses the HTTP endpoint.
  if (!options.cbm) {
    const bin = process.env.CBM_BIN || "codebase-memory-mcp";
    try {
      execFileSync(bin, ["cli", "delete_project", "--project", name], {
        encoding: "utf8",
        timeout: 20_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    } catch (cause) {
      const error = cause as { stderr?: string; message?: string };
      throw new Error(
        `delete project ${name} failed: ${(error.stderr || error.message || String(cause)).trim().slice(0, 300)}`,
        { cause },
      );
    }
  }

  const endpoint = await resolveCbmBaseUrl(options.cbm);
  const base = assertLoopback(endpoint.baseUrl);
  const url = new URL("/api/project", base);
  url.searchParams.set("name", name);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`delete project ${name}: HTTP ${response.status} ${body.slice(0, 300)}`);
    }
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(`delete project ${name}: request timed out`);
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
