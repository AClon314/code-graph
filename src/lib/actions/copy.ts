/** Copy-target resolution and the short success animation shared by toolbar/keys. */
import type { AiContext, CopyMode } from "../ai-context";
import { buildAiContext } from "../ai-context";
import { bundleFromGraph } from "../graph/neighborhood";
import type { GraphViewData, GraphViewNode, SymbolBundle } from "../graph/types";
import type { GraphViewHandle } from "../graph/view-handle";
import type { StatusState } from "../state/code-graph";
import { activeJumpRow, type JumpRow } from "./symbol";
import { copyToolbar } from "./toolbar";

export interface CopyTarget {
  row: JumpRow | null;
  context: AiContext | null;
}

/** Use the selection, or the graph root when nothing is selected. */
export function copyTargetFor(
  graph: GraphViewData | null,
  selectedNode: GraphViewNode | null,
  selectionBundle: SymbolBundle | null,
  workspaceRoot: string,
  project: string,
): CopyTarget {
  const rootNode =
    graph?.nodes.find((node) => node.id === graph.root) ?? graph?.nodes[0] ?? null;
  const node = selectedNode ?? rootNode;
  const bundle =
    selectionBundle ??
    (!selectedNode && graph && rootNode
      ? (bundleFromGraph(graph, rootNode.id) ?? null)
      : null);
  return {
    row: activeJumpRow(node, bundle),
    context: buildAiContext(bundle, node, workspaceRoot, project),
  };
}

export interface CopyFlash {
  success(): void;
}

/** Toggle a one-shot class; callers bind the boolean to the copy capsule. */
export function createCopyFlash(onChange: (active: boolean) => void): CopyFlash {
  let timer = 0;
  return {
    success() {
      onChange(false);
      window.clearTimeout(timer);
      window.setTimeout(() => (onChange(true)), 0);
      timer = window.setTimeout(() => onChange(false), 1500);
    },
  };
}

interface CopyModeOptions {
  mode: CopyMode;
  view: GraphViewHandle | undefined;
  renderer: string;
  target: CopyTarget;
  workspaceRoot: string;
  status: StatusState;
  flash: CopyFlash;
}

export async function copyGraphMode({
  mode,
  view,
  renderer,
  target,
  workspaceRoot,
  status,
  flash,
}: CopyModeOptions): Promise<boolean> {
  const copied = await copyToolbar({
    mode,
    view,
    renderer,
    row: target.row,
    workspaceRoot,
    context: target.context,
    status,
  });
  if (copied) flash.success();
  return copied;
}
