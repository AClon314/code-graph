/** Clipboard/download actions shared by the toolbar and keyboard shortcuts. */
import type { GraphViewHandle } from "../graph/view-handle";
import type { StatusState } from "../state/code-graph";
import { writeClipboard } from "../clipboard";
import { downloadSvg, svgFilename, svgMarkup } from "../graph/svg-export";
import { errorMessage } from "../errors";

export async function copyGraphSvg(
  view: GraphViewHandle | undefined,
  status: StatusState,
): Promise<void> {
  const svg = view?.snapshotSvg?.() ?? null;
  if (!svg) {
    status.export = "Nothing to copy as SVG";
    return;
  }
  try {
    await writeClipboard(svgMarkup(svg));
    status.export = "Copied SVG";
  } catch (cause) {
    status.export = `Copy SVG failed: ${errorMessage(cause)}`;
  }
}

export function exportGraphSvg(
  view: GraphViewHandle | undefined,
  entry: string,
  status: StatusState,
): void {
  const svg = view?.snapshotSvg?.() ?? null;
  if (!svg) {
    status.export = "Nothing to export as SVG";
    return;
  }
  try {
    const filename = downloadSvg(svg, svgFilename(entry));
    status.export = `Exported ${filename}`;
  } catch (cause) {
    status.export = `Export failed: ${errorMessage(cause)}`;
  }
}

export async function copyTerminalArt(
  view: GraphViewHandle | undefined,
  status: StatusState,
): Promise<void> {
  try {
    await view?.copy?.();
    status.export = "Copied character art";
  } catch (cause) {
    status.export = `Copy failed: ${errorMessage(cause)}`;
  }
}
