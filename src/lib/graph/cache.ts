/** Per-workspace static frame cache layout shared by the Fresh plugin and tests. */
export type FrameBackend = "cbm" | "scip";

export function frameCacheDir(root: string, backend: FrameBackend): string {
  return `${root.replace(/\/+$/, "")}/.codebase-memory/code-graph/${backend}`;
}

export function frameCachePath(root: string, backend: FrameBackend): string {
  return `${frameCacheDir(root, backend)}/frame.json`;
}

export function panelName(backend: FrameBackend): string {
  return backend === "scip" ? " *code-graph (SCIP)* " : " *code-graph (cbm)* ";
}
