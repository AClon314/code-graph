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
  localCbmCandidates,
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

/** Fetch one cbm API request through the Node host. */
export async function fetchLocalCbm(
  baseUrl: string,
  request: CbmHttpRequest,
): Promise<CbmHttpResponse> {
  return requestCbm(baseUrl || DEFAULT_CBM_BASE_URL, request, {
    timeoutMs: FETCH_TIMEOUT_MS,
  });
}
