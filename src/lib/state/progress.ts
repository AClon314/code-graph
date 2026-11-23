import { estimateEta, type NeighborhoodProgress } from "../graph/loading";
import type { LoadState } from "./code-graph";

/**
 * Owns the 250ms ETA refresh timer for the status bar. The state object itself
 * remains JSON-safe; the timer and its lifecycle stay in this controller.
 */
export class ProgressController {
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Last completed total per query; keeps the ALL denominator stable. */
  private hints = new Map<string, number>();

  constructor(private readonly load: LoadState) {}

  begin(label: string, total: number | null): void {
    const now = Date.now();
    this.load.progress = {
      label,
      completed: 0,
      total,
      queued: 0,
      startedAt: now,
      updatedAt: now,
      etaMs: null,
    };
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), 250);
  }

  key(project: string, root: string, depth: number | null, direction: string): string {
    return [project, root, depth ?? "*", direction].join("|");
  }

  knownTotal(key: string): number | undefined {
    return this.hints.get(key);
  }

  update(progress: NeighborhoodProgress, key?: string): void {
    const now = Date.now();
    const existing = this.load.progress;
    const total = progress.total > 0 ? progress.total : null;
    if (key && progress.queued === 0 && progress.fetched >= progress.total) {
      this.hints.set(key, progress.total);
    }
    this.load.progress = {
      label: existing?.label ?? "Loading graph",
      completed: progress.fetched,
      total,
      queued: progress.queued,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      etaMs: estimateEta(
        { completed: progress.fetched, total, startedAt: existing?.startedAt ?? now },
        now,
      ),
    };
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.load.progress = null;
  }

  private refresh(): void {
    const progress = this.load.progress;
    if (!progress) return;
    progress.updatedAt = Date.now();
    progress.etaMs = estimateEta(progress, progress.updatedAt);
  }
}
