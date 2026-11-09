import { HEADER_ROWS, headerEntries, headerLines } from "./panel-chrome.ts";
import type { RootCandidate } from "../src/lib/graph/roots.ts";

export interface RootPickerState {
  roots: RootCandidate[];
  selected: number;
}

/** The subset of PanelState the picker mutates. */
export interface RootPickerPanel {
  bufferId: number | null;
  picker: RootPickerState | null;
  entry: string;
  headerRows: number;
  selectedNodeId: string | null;
}

export interface RootPickerActions {
  setContent(lines: string[], entries: Record<string, unknown>[]): void;
  clearNamespace(): void;
  setStatus(message: string): void;
  setEntry(entry: string): void;
  reload(): void;
  renderFrame(): void;
  openSelected(): void;
  promptEntry(): Promise<void>;
}

export function paintRootPicker(
  panel: RootPickerPanel,
  roots: RootCandidate[],
  selected: number,
  actions: RootPickerActions,
): void {
  if (panel.bufferId === null) return;
  const index = Math.max(0, Math.min(selected, roots.length - 1));
  panel.picker = { roots, selected: index };
  panel.headerRows = HEADER_ROWS;
  panel.selectedNodeId = null;
  const header = headerLines(false);
  header[1] = "Select root · ↑/↓ Enter · c custom · Esc cancel";
  const lines = [...header];
  const entries: Record<string, unknown>[] = [...headerEntries(false)];
  entries[1] = { text: "\n" + header[1] + "\n" };
  roots.forEach((root, rootIndex) => {
    const marker = rootIndex === index ? "›" : " ";
    const line =
      marker +
      " " +
      String(rootIndex + 1).padStart(2, "0") +
      "  " +
      root.qualifiedName +
      (root.reason ? "  (" + root.reason + ")" : "");
    lines.push(line);
    entries.push({ text: line + "\n" });
  });
  lines.push("");
  entries.push({ text: "\n" });
  actions.clearNamespace();
  actions.setContent(lines, entries);
  actions.setStatus(
    "Code Graph: pick a root (" +
      roots.length +
      ") · ↑/↓ Enter · c custom · Esc cancel",
  );
}

export function chooseRoot(
  panel: RootPickerPanel,
  index: number,
  actions: RootPickerActions,
): void {
  const root = panel.picker?.roots[index];
  if (!root) return;
  panel.picker = null;
  actions.setEntry(root.qualifiedName);
  actions.setStatus("Code Graph: entry = " + root.qualifiedName);
  actions.reload();
}

export function moveRootPicker(
  panel: RootPickerPanel,
  delta: number,
  actions: RootPickerActions,
): void {
  if (!panel.picker) return;
  const next = Math.max(
    0,
    Math.min(panel.picker.roots.length - 1, panel.picker.selected + delta),
  );
  paintRootPicker(panel, panel.picker.roots, next, actions);
}

export function acceptRootPicker(
  panel: RootPickerPanel,
  actions: RootPickerActions,
): void {
  if (!panel.picker) {
    actions.openSelected();
    return;
  }
  chooseRoot(panel, panel.picker.selected, actions);
}

export function cancelRootPicker(
  panel: RootPickerPanel,
  actions: RootPickerActions,
): void {
  if (!panel.picker) return;
  panel.picker = null;
  actions.renderFrame();
}

export function customRootEntry(
  panel: RootPickerPanel,
  actions: RootPickerActions,
): void {
  panel.picker = null;
  void actions.promptEntry();
}

/** Row index into the picker list, or null for the toolbar/instruction rows. */
export function pickerIndex(panel: RootPickerPanel, row: number): number | null {
  if (!panel.picker || row < HEADER_ROWS) return null;
  const index = row - HEADER_ROWS;
  return index >= 0 && index < panel.picker.roots.length ? index : null;
}
