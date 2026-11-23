/** Operation-bar actions, kept out of App.svelte's lifecycle wiring. */
import type { AiContext, CopyMode, SaveMode } from "../ai-context";
import type { GraphViewHandle } from "../graph/view-handle";
import type { StatusState } from "../state/code-graph";
import type { JumpRow } from "./symbol";
import { copyAiContext } from "./ai-context";
import { copyGraphSvg, copyTerminalArt, exportGraphSvg } from "./graph-export";
import { copySymbolPath } from "./symbol";

interface CopyOptions {
  mode: CopyMode;
  view: GraphViewHandle | undefined;
  renderer: string;
  row: JumpRow | null;
  workspaceRoot: string;
  context: AiContext | null;
  status: StatusState;
}

export async function copyToolbar({
  mode,
  view,
  renderer,
  row,
  workspaceRoot,
  context,
  status,
}: CopyOptions): Promise<boolean> {
  if (mode === "svg") {
    return renderer === "orchgraph"
      ? copyTerminalArt(view, status)
      : copyGraphSvg(view, status);
  }
  if (mode === "markdown" || mode === "json") {
    return copyAiContext(context, mode, status);
  }
  return copySymbolPath(mode, row, workspaceRoot, status);
}

interface SaveOptions {
  mode: SaveMode;
  view: GraphViewHandle | undefined;
  entry: string;
  status: StatusState;
}

export function saveToolbar({ mode, view, entry, status }: SaveOptions): void {
  if (mode === "svg") exportGraphSvg(view, entry, status);
}
