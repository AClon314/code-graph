import { estimateEta, type NeighborhoodProgress } from "../graph/loading";
import type { LoadState } from "./code-graph";

/**
 * Owns the 250ms ETA refresh timer for the status bar. The state object itself
 * remains JSON-safe; the timer and its lifecycle stay in this controller.
 */
export class ProgressController {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly load: LoadState) {}

  begin(label: string, total: number | null): void {
    const now = Date.now();
    this.load.progress = {
      label,
      completed: 0,
      total,
      startedAt: now,
      updatedAt: now,
      etaMs: null,
    };
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), 250);
  }

  update(progress: NeighborhoodProgress): void {
    const now = Date.now();
    const existing = this.load.progress;
    const total = progress.total > 0 ? progress.total : null;
    this.load.progress = {
      label: existing?.label ?? "Loading graph",
      completed: progress.fetched,
      total,
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
