/**
 * Bun-side root discovery shared by the CLI and the TUI entries script.
 * Browser code must use roots.ts/fetchRootCandidates with an explicit base URL
 * instead, because resolveCbmBaseUrl shells out to the cbm binary.
 */
import { resolveCbmBaseUrl } from "../cbm-discovery.ts";
import { fetchRootCandidates, type RootCandidate } from "./roots.ts";
import type { FetchLike } from "../cbm-endpoint.ts";

export interface RootsFetchOptions {
  cbm?: string;
  limit?: number;
  fetchImpl?: FetchLike;
}

/** Resolve the local cbm endpoint and fetch a project's finite root list. */
export async function loadProjectRoots(
  project: string,
  options: RootsFetchOptions = {},
): Promise<RootCandidate[]> {
  const endpoint = await resolveCbmBaseUrl(options.cbm, options.fetchImpl);
  return fetchRootCandidates(
    endpoint.baseUrl,
    project,
    options.limit ?? 50,
    options.fetchImpl,
  );
}

/** Format one candidate per line; the table stays copy/paste friendly. */
export function formatRoots(candidates: RootCandidate[]): string {
  if (candidates.length === 0) return "no root candidates";
  return candidates
    .map((candidate) => {
      const location = candidate.filePath
        ? `${candidate.filePath}:${candidate.startLine}`
        : "(no file)";
      return `${candidate.qualifiedName}\t${location}\t${candidate.reason}`;
    })
    .join("\n");
}
