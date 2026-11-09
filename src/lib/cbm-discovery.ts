/**
 * Bun-side local cbm discovery.
 *
 * Prefer the daemon's effective port from `codebase-memory-mcp config get
 * ui_port`; if that fails, probe the local default 9749. Remote endpoints are
 * intentionally not supported.
 */

import { execFileSync } from "node:child_process";

import {
  discoverCbmEndpoint,
  endpointCandidatesFromPort,
  normalizeBaseUrl,
  type CbmProbeResult,
  type FetchLike,
} from "./cbm-endpoint.ts";

export interface CbmPortLookup {
  port?: number;
  error?: string;
}

/** Read the effective UI port. Never throws; the caller probes it. */
export function readCbmPortFromCli(): CbmPortLookup {
  const explicit = process.env.CBM_PORT?.trim();
  if (explicit) {
    const port = Number(explicit);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return { port };
    return { error: `CBM_PORT is not a valid port: ${explicit}` };
  }

  const bin = process.env.CBM_BIN || "codebase-memory-mcp";
  try {
    const stdout = execFileSync(bin, ["config", "get", "ui_port"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const matches = stdout.match(/\b\d{1,5}\b/g);
    const raw = matches?.at(-1);
    const port = raw ? Number(raw) : NaN;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return { error: `${bin} config get ui_port returned no valid port: ${stdout.trim()}` };
    }
    return { port };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return { error: `${bin} config get ui_port failed: ${error.message}` };
  }
}

/**
 * Resolve an explicit `--cbm`/CBM_HTTP override as-is, otherwise discover the
 * local daemon port and then 9749.
 */
export async function resolveCbmBaseUrl(
  explicit?: string,
  fetchImpl: FetchLike = fetch,
): Promise<CbmProbeResult> {
  const direct = explicit || process.env.CBM_HTTP;
  if (direct) {
    const baseUrl = normalizeBaseUrl(direct);
    return { baseUrl, ui: {} };
  }

  const lookup = readCbmPortFromCli();
  const context = lookup.error ? `cbm port discovery: ${lookup.error}` : undefined;
  return discoverCbmEndpoint({
    candidates: endpointCandidatesFromPort(lookup.port),
    fetchImpl,
    context,
  });
}
