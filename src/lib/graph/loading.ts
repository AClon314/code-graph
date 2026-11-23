/** Progress reported by the neighbourhood BFS, in UI-friendly terms. */
export interface NeighborhoodProgress {
  /** `root` fetches the initial symbol; `neighbors` walks its connections. */
  phase: "root" | "neighbors";
  fetched: number;
  queued: number;
  /** Best-known total; grows as BFS discovers more neighbours. */
  total: number;
}

/** JSON-safe progress displayed in the status bar. */
export interface LoadProgress {
  label: string;
  completed: number;
  /** null means indeterminate (for example while the root symbol is fetched). */
  total: number | null;
  /** Current BFS frontier; used for a less jumpy ETA when total is growing. */
  queued?: number;
  startedAt: number;
  updatedAt: number;
  etaMs: number | null;
}

/** Estimate remaining time from the average completed-fetch rate. */
export function estimateEta(
  progress: Pick<LoadProgress, "completed" | "total" | "startedAt" | "queued">,
  now: number,
): number | null {
  if (progress.total === null || progress.completed <= 0) return null;
  const queued = progress.queued ?? 0;
  const remaining = queued > 0 ? queued : Math.max(0, progress.total - progress.completed);
  if (remaining === 0) return 0;
  const elapsed = Math.max(0, now - progress.startedAt);
  if (elapsed <= 0) return null;
  return Math.max(0, Math.round((elapsed / progress.completed) * remaining));
}

/** Compact ETA for a status-bar line. */
export function formatEta(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return "<1s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Human-readable status text, or null when there is no active progress. */
export function progressLabel(progress: LoadProgress): string {
  const count =
    progress.total === null
      ? ""
      : ` ${progress.completed}/${progress.total}`;
  const eta = formatEta(progress.etaMs);
  return `${progress.label}${count}${eta ? ` · ~${eta}` : ""}`;
}
