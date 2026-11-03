/**
 * Discovery of a *local* cbm HTTP endpoint.
 *
 * The GUI and TUI intentionally do not support remote/cross-origin cbm
 * backends. A caller may supply a candidate port (from `config get ui_port`);
 * 9749 is always probed as the local default.
 */

export const DEFAULT_CBM_PORT = 9749;
export const DEFAULT_CBM_BASE_URL = `http://127.0.0.1:${DEFAULT_CBM_PORT}`;

export interface CbmUiConfig {
  lang?: string;
  version?: string;
  upstream_issues_url?: string;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface CbmProbeResult {
  baseUrl: string;
  ui: CbmUiConfig;
}

export interface CbmProbeAttempt {
  baseUrl: string;
  error: Error;
}

export class CbmEndpointError extends Error {
  readonly attempts: CbmProbeAttempt[];

  constructor(message: string, attempts: CbmProbeAttempt[], options?: ErrorOptions) {
    super(message, options);
    this.name = "CbmEndpointError";
    this.attempts = attempts;
  }
}

/** Probe `/api/ui-config` and verify that the response looks like cbm. */
export async function probeCbm(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 1200,
): Promise<CbmProbeResult> {
  const normalized = normalizeBaseUrl(baseUrl);
  const url = `${normalized}/api/ui-config`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}: ${body.slice(0, 400)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new Error(`GET ${url} did not return JSON: ${body.slice(0, 400)}`, { cause });
  }
  if (!isCbmUiConfig(parsed)) {
    throw new Error(`GET ${url} is not a cbm /api/ui-config response: ${body.slice(0, 400)}`);
  }
  return { baseUrl: normalized, ui: parsed };
}

/** Probe candidates in order and return the first working cbm endpoint. */
export async function discoverCbmEndpoint(options: {
  candidates?: Array<string | number | null | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  context?: string;
} = {}): Promise<CbmProbeResult> {
  const candidates = normalizeCandidates(options.candidates ?? []);
  const attempts: CbmProbeAttempt[] = [];
  for (const baseUrl of candidates) {
    try {
      return await probeCbm(baseUrl, options.fetchImpl, options.timeoutMs);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      attempts.push({ baseUrl, error });
    }
  }
  const tried = attempts.map((attempt) => `  ${attempt.baseUrl}: ${attempt.error.message}`).join("\n");
  const prefix = options.context ? `${options.context}\n` : "";
  throw new CbmEndpointError(
    `${prefix}No local cbm endpoint responded. Tried:\n${tried}`,
    attempts,
  );
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function endpointCandidatesFromPort(port: number | null | undefined): string[] {
  const candidates: string[] = [];
  if (typeof port === "number" && Number.isInteger(port) && port > 0 && port <= 65535) {
    candidates.push(`http://127.0.0.1:${port}`);
  }
  candidates.push(DEFAULT_CBM_BASE_URL);
  return candidates;
}

function normalizeCandidates(values: Array<string | number | null | undefined>): string[] {
  const output: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const url = typeof value === "number" ? `http://127.0.0.1:${value}` : normalizeBaseUrl(value);
    if (!output.includes(url)) output.push(url);
  }
  return output;
}

function isCbmUiConfig(value: unknown): value is CbmUiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  // cbm's route always includes a version. A random JSON service is rejected.
  return typeof record.version === "string" && record.version.length > 0;
}

/** Render an endpoint failure with the full attempt/cause stacks for the UI. */
export function formatCbmEndpointError(error: unknown): string {
  if (error instanceof CbmEndpointError) {
    const parts = [error.stack ?? error.message];
    for (const attempt of error.attempts) {
      parts.push(`\n--- ${attempt.baseUrl} ---\n${attempt.error.stack ?? attempt.error.message}`);
    }
    return parts.join("\n");
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
