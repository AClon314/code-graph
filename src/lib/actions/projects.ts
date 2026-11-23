/** Destructive project actions shared by the Setup panel and CLI-adjacent UI. */
import type { CbmFetch } from "../cbm-projects";
import {
  cbmProjectNameFromPath,
  deleteCbmProjectViaApi,
  staleCbmProjects,
} from "../cbm-projects";
import { fetchCbmIndexJobs, startCbmIndex } from "../cbm-index";

/** Delete every project whose last index is older than `days`. */
export async function deleteStaleProjects(
  fetchCbm: CbmFetch,
  days: number,
): Promise<string[]> {
  const stale = await staleCbmProjects(fetchCbm, days);
  const deleted: string[] = [];
  for (const project of stale) {
    await deleteCbmProjectViaApi(fetchCbm, project.name);
    deleted.push(project.name);
  }
  return deleted;
}

const pendingIndexes = new Map<string, Promise<string>>();

/** Start a folder index and wait until the cbm worker reports done/error. */
export function indexCbmFolder(
  fetchCbm: CbmFetch,
  folder: string,
  project = cbmProjectNameFromPath(folder),
): Promise<string> {
  const existing = pendingIndexes.get(folder);
  if (existing) return existing;
  const request = (async () => {
    const job = await startCbmIndex(fetchCbm, folder, project);
    const deadline = Date.now() + 10 * 60 * 1000;
    for (;;) {
      const jobs = await fetchCbmIndexJobs(fetchCbm);
      const current = jobs.find((candidate) =>
        job.slot >= 0 ? candidate.slot === job.slot : candidate.path === job.path,
      );
      if (current?.status === "done") return project;
      if (current?.status === "error") throw new Error(current.error || `index ${folder} failed`);
      if (Date.now() > deadline) throw new Error(`index ${folder} timed out`);
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  })();
  pendingIndexes.set(folder, request);
  request.finally(() => pendingIndexes.delete(folder)).catch(() => {});
  return request;
}
