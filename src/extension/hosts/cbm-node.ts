/**
 * Node-only local cbm transport used by the VS Code extension host.
 *
 * The webview must never fetch cbm directly: in a remote code-server session
 * the browser's 127.0.0.1 is the client, not the machine running cbm. This
 * module runs in the Node extension host, so it can discover and reach the
 * server-local cbm without CORS.
 */

import {
  DEFAULT_CBM_BASE_URL,
  discoverCbmEndpoint,
  endpointCandidatesFromPort,
  normalizeBaseUrl,
} from "../../lib/cbm-endpoint";
import { readCbmPortFromCli } from "../../../tui/cbm-discovery";
import type { CbmHttpRequest, CbmHttpResponse } from "../api";

const FETCH_TIMEOUT_MS = 5000;

/** Resolve a local cbm base URL: config get port, configured override, 9749. */
export async function resolveLocalCbm(configured?: string): Promise<string> {
  const lookup = readCbmPortFromCli();
  const candidates = endpointCandidatesFromPort(lookup.port);
  if (configured) {
    const normalized = normalizeBaseUrl(configured);
    if (normalized && !candidates.includes(normalized)) candidates.splice(1, 0, normalized);
  }
  const result = await discoverCbmEndpoint({
    candidates,
    context: lookup.error ? `cbm port discovery: ${lookup.error}` : undefined,
  });
  return result.baseUrl;
}

/** Fetch one cbm API request through the Node host. */
export async function fetchLocalCbm(
  baseUrl: string,
  request: CbmHttpRequest,
): Promise<CbmHttpResponse> {
  if (!request.path.startsWith("/api/") || request.path.startsWith("//")) {
    throw new Error(`cbm proxy only accepts /api/ paths, got ${request.path}`);
  }
  const base = normalizeBaseUrl(baseUrl || DEFAULT_CBM_BASE_URL);
  const url = new URL(request.path, base);
  if (url.origin !== new URL(base).origin) {
    throw new Error(`cbm proxy refused cross-origin request: ${url.href}`);
  }
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? "GET",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: request.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  return { status: response.status, body: await response.text() };
}
