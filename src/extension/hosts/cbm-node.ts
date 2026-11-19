/**
 * Node-only local cbm transport used by the VS Code extension host.
 *
 * The webview must never fetch cbm directly: in a remote code-server session
 * the browser's 127.0.0.1 is the client, not the machine running cbm. This
 * module runs in the Node extension host, so it can discover and reach the
 * server-local cbm without CORS.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import {
  DEFAULT_CBM_BASE_URL,
  discoverCbmEndpoint,
  localCbmCandidates,
  probeCbm,
} from "../../lib/cbm-endpoint";
import { requestCbm } from "../../lib/cbm-request";
import { readCbmPortFromCli } from "../../lib/cbm-discovery.ts";
import type { CbmHttpRequest, CbmHttpResponse } from "../api";

const FETCH_TIMEOUT_MS = 5000;

/** Resolve a local cbm base URL: config get port, configured override, 9749. */
export async function resolveLocalCbm(configured?: string): Promise<string> {
  const lookup = readCbmPortFromCli();
  const result = await discoverCbmEndpoint({
    candidates: localCbmCandidates(lookup.port, configured),
    context: lookup.error ? `cbm port discovery: ${lookup.error}` : undefined,
  });
  return result.baseUrl;
}

const execFileAsync = promisify(execFile);
const RESTART_TIMEOUT_MS = 15_000;

/**
 * Best-effort restart of the local listener: stop the shared daemon (when
 * available), spawn the same UI listener again, then wait for /api/ui-config.
 * A packaged extension cannot rely on the repository's shell helper, so this
 * intentionally uses only the cbm binary and its documented flags.
 */
export async function restartLocalCbm(configured?: string): Promise<void> {
  const base = configured || DEFAULT_CBM_BASE_URL;
  const port = new URL(base).port || new URL(DEFAULT_CBM_BASE_URL).port;
  const bin = process.env.CBM_BIN || "codebase-memory-mcp";
  try {
    await execFileAsync(bin, ["daemon", "stop"], { timeout: 5_000 });
  } catch {
    // The daemon may be absent or already stopped; the UI listener can still
    // be restarted directly.
  }
  // cbm's UI listener exits when stdin closes. Keep it open with a sleeper,
  // mirroring scripts/cbm-service.sh, and detach the shell from the extension.
  const command = `sleep 2147483647 | ${shellQuote(bin)} --ui=true --port=${shellQuote(port)}`;
  const child = spawn("bash", ["-c", command], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await probeCbm(base);
      return;
    } catch (cause) {
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(
    `cbm did not become healthy after restart: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Fetch one cbm API request through the Node host. */
export async function fetchLocalCbm(
  baseUrl: string,
  request: CbmHttpRequest,
): Promise<CbmHttpResponse> {
  return requestCbm(baseUrl || DEFAULT_CBM_BASE_URL, request, {
    timeoutMs: FETCH_TIMEOUT_MS,
  });
}
