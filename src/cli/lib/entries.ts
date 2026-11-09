import { resolveCbmBaseUrl } from "../../lib/cbm-discovery.ts";
import { fetchRootCandidates, type RootCandidate } from "../../lib/graph/roots.ts";

export interface EntriesOptions {
  cbm?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

/** Fetch root candidates for the CLI from the local cbm daemon. */
export async function entriesForProject(
  project: string,
  options: EntriesOptions = {},
): Promise<RootCandidate[]> {
  const endpoint = await resolveCbmBaseUrl(options.cbm, options.fetchImpl);
  return fetchRootCandidates(endpoint.baseUrl, project, options.limit ?? 50, options.fetchImpl);
}

/** Format one candidate per line; the table stays copy/paste friendly. */
export function formatEntries(candidates: RootCandidate[]): string {
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
