import type { RootCandidate } from "../src/lib/graph/roots.ts";

export interface EntryFlowHost {
  loadRoots(): Promise<RootCandidate[]>;
  paintRoots(roots: RootCandidate[]): void;
  promptEntry(): Promise<void>;
  setStatus(message: string): void;
}

export async function reportEntryCandidates(
  host: EntryFlowHost,
): Promise<void> {
  const roots = await host.loadRoots();
  if (roots.length > 0) {
    host.paintRoots(roots);
    return;
  }
  host.setStatus(
    "Code Graph: no root candidates found; set CODE_NAV_ENTRY or CODE_NAV_SYMBOL_ENTRY manually",
  );
}

export async function setEntry(host: EntryFlowHost): Promise<void> {
  const roots = await host.loadRoots();
  if (roots.length > 0) {
    host.paintRoots(roots);
    return;
  }
  await host.promptEntry();
}
