import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  deleteCbmProjectViaApi,
  fetchCbmProjectHealth,
  fetchCbmProjectRows,
  fetchCbmProjects,
  staleCbmProjects,
  type CbmFetch,
  type CbmProject,
} from "../../lib/cbm-projects.ts";
import { requestCbm } from "../../lib/cbm-request.ts";
import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";

export interface CbmProjectOptions {
  cbm?: string;
}

/** Build a cbm transport for the CLI's resolved loopback endpoint. */
async function cbmFetch(options: CbmProjectOptions = {}): Promise<CbmFetch> {
  const endpoint = await resolveCbmBaseUrl(options.cbm);
  assertLoopback(endpoint.baseUrl);
  return (request) => requestCbm(endpoint.baseUrl, request, { timeoutMs: 10_000 });
}

/** List cbm project metadata through the read-only JSON-RPC tool. */
export async function listCbmProjectRows(
  options: CbmProjectOptions = {},
): Promise<CbmProject[]> {
  return fetchCbmProjectRows(await cbmFetch(options));
}

/** List cbm projects through the read-only JSON-RPC tool. */
export async function listCbmProjects(options: CbmProjectOptions = {}): Promise<string[]> {
  return fetchCbmProjects(await cbmFetch(options));
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
  // default local daemon. An explicit --cbm URL uses the UI's HTTP mutation
  // route, then removes the sidecar locally when the daemon predates that fix.
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

  await deleteCbmProjectViaApi(await cbmFetch(options), name);
  removeLocalAdrSidecar(name);
}

function cbmCacheDir(): string {
  return (
    process.env.CBM_CACHE_DIR ||
    (process.platform === "darwin"
      ? join(homedir(), "Library", "Caches", "codebase-memory-mcp")
      : join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "codebase-memory-mcp"))
  );
}

function removeLocalAdrSidecar(name: string): void {
  for (const suffix of [
    ".db.adr.db",
    ".db.adr.db-wal",
    ".db.adr.db-shm",
    ".db.adr.db-journal",
  ]) {
    const path = join(cbmCacheDir(), `${name}${suffix}`);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch (cause) {
        console.warn(`ADR sidecar cleanup skipped for ${path}: ${String(cause)}`);
      }
    }
  }
}

/** Return names whose last index is older than the cutoff. */
export async function staleCbmProjectNames(
  days: number,
  options: CbmProjectOptions = {},
): Promise<string[]> {
  return (await staleCbmProjects(await cbmFetch(options), days)).map((project) => project.name);
}

/** Verify both the live project table and the on-disk DB/sidecars are gone. */
export async function verifyCbmProjectDeleted(
  name: string,
  options: CbmProjectOptions = {},
): Promise<void> {
  const rows = await listCbmProjectRows(options);
  if (rows.some((row) => row.name === name)) {
    throw new Error(`project ${name} still appears in list_projects after delete`);
  }
  const health = await fetchCbmProjectHealth(await cbmFetch(options), name);
  if (health && health.status !== "missing") {
    throw new Error(`project ${name} health is ${health.status} after delete`);
  }

  const cacheDir = cbmCacheDir();
  for (const suffix of [
    ".db",
    ".db-wal",
    ".db-shm",
    ".db-journal",
    ".db.adr.db",
    ".db.adr.db-wal",
    ".db.adr.db-shm",
    ".db.adr.db-journal",
  ]) {
    const path = join(cacheDir, `${name}${suffix}`);
    if (existsSync(path)) throw new Error(`project ${name} left ${path}`);
  }
}
