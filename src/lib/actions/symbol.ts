import type { ExtensionApi } from "../../extension/api";
import { copyPathText, pathFormats, type PathCopyKind } from "../path-location";
import { writeClipboard } from "../clipboard";
import type { StatusState } from "../state/code-graph";

export interface JumpRow {
  filePath?: string;
  startLine?: number;
  startColumn?: number;
  qualifiedName?: string;
  name?: string;
}

/** Open a symbol location through the active host and keep status messages out of the caller. */
export async function jumpToLocation(
  row: JumpRow | null,
  project: string,
  api: Pick<ExtensionApi, "openLocation">,
  status: StatusState,
): Promise<void> {
  status.jump = "";
  status.jumpError = "";
  if (!row?.filePath) {
    status.jumpError = "This symbol has no file path to jump to.";
    return;
  }

  const line = row.startLine ?? 1;
  const column = row.startColumn ?? 1;
  status.jump = `Opening ${row.filePath}:${line}:${column}…`;
  try {
    await api.openLocation({
      project,
      path: row.filePath,
      line,
      column,
      symbol: row.qualifiedName ?? row.name,
    });
    status.jump = `Opened ${row.filePath}:${line}:${column}`;
  } catch (cause) {
    status.jump = "";
    status.jumpError = `Open failed: ${errorMessage(cause)}`;
  }
}

/** Copy a symbol path in the requested form, with relative/absolute validation. */
export async function copySymbolPath(
  kind: PathCopyKind,
  row: JumpRow | null,
  workspaceRoot: string,
  status: StatusState,
): Promise<void> {
  status.copy = "";
  status.copyError = "";
  if (!row?.filePath) {
    status.copyError = "This symbol has no file path to copy.";
    return;
  }

  const text = copyPathText(
    kind,
    pathFormats(row.filePath, workspaceRoot),
    row.startLine,
    row.startColumn,
  );
  if (!text) {
    status.copyError =
      kind === "absolute" || kind === "both"
        ? "Absolute path unavailable: no workspace root."
        : "Relative path unavailable for this file.";
    return;
  }

  try {
    await writeClipboard(text);
    status.copy = kind === "both" ? "Copied relative + absolute paths" : `Copied ${kind} path`;
  } catch (cause) {
    status.copyError = `Copy failed: ${errorMessage(cause)}`;
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
