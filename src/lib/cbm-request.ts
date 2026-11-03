/**
 * One cbm HTTP request builder/transport shared by the extension, Fresh, and
 * browser-dev hosts.
 *
 * The API surface is deliberately small: only `/api/` paths on the configured
 * base are allowed. Normalizing before the check matters because `/api/../x`
 * is a valid prefix string but a different path after URL parsing.
 */

import {
  normalizeBaseUrl,
  type FetchLike,
} from "./cbm-endpoint";

export interface CbmHttpRequest {
  path: string;
  query?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

export interface CbmHttpResponse {
  status: number;
  body: string;
}

export interface CbmRequestOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Build and validate a cbm URL, then apply the request query parameters. */
export function cbmRequestUrl(baseUrl: string, request: CbmHttpRequest): URL {
  const base = new URL(normalizeBaseUrl(baseUrl));
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error(`cbm base must be an http(s) URL, got ${base.href}`);
  }
  if (!request.path.startsWith("/api/") || request.path.startsWith("//")) {
    throw new Error(`cbm proxy only accepts /api/ paths, got ${request.path}`);
  }

  const url = new URL(request.path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) {
    throw new Error(`cbm proxy refused path outside /api/: ${request.path}`);
  }
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** Fetch one cbm request and return its text body, including error responses. */
export async function requestCbm(
  baseUrl: string,
  request: CbmHttpRequest,
  options: CbmRequestOptions = {},
): Promise<CbmHttpResponse> {
  const url = cbmRequestUrl(baseUrl, request);
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    throw new Error(`cbm proxy only accepts GET or POST, got ${String(method)}`);
  }

  const controller =
    options.timeoutMs === undefined ? undefined : new AbortController();
  const timer =
    controller === undefined
      ? undefined
      : setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method,
      headers: {
        accept: "application/json",
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      // GET/HEAD requests cannot carry a body in fetch().
      body: method === "POST" ? request.body : undefined,
      signal: controller?.signal,
    });
    return { status: response.status, body: await response.text() };
  } catch (cause) {
    if (controller?.signal.aborted) {
      throw new Error(
        `cbm request timed out after ${options.timeoutMs}ms: ${url.pathname}`,
        { cause },
      );
    }
    throw cause;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
