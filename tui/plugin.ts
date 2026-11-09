// code-graph.ts — Fresh plugin (QuickJS sandbox).
//
// The plugin does NOT lay out or render a graph. Bun runs tui/render.ts
// (orchgraph + ELK) and writes a frame JSON; this file only paints that frame
// into a virtual buffer and implements the code-navigator interactions.
//
// QuickJS rules: no runtime imports, no Node APIs, no DOM. The shared host
// adapter is bundled into this file; only editor.* calls and the global
// registerHandler-style helpers that Fresh exposes are available.
//
// Two backends are intentionally separate commands:
//   Code Graph: Open (cbm)   → cbm-native project
//   Code Graph: Open (SCIP)  → scip-cbm-writer project
// Each window owns one panel per backend, with its own cache file.

import { extensionApi } from "../src/extension/host.ts";
import type { JumpTarget } from "../src/lib/jump/types";
import { frameCachePath, panelName as sharedPanelName } from "../src/lib/graph/cache";
import {
  backendConfig,
  loadOrCreateProjectConfig,
  type ProjectConfig,
} from "../src/lib/config";
import {
  HEADER_ROWS,
  HELP_LINES,
  headerEntries,
  headerLines,
  toolbarActionAt,
  type ToolbarAction,
} from "./panel-chrome.ts";
import type { Frame, NodeBox, NodeMeta } from "./frame-types.ts";
import type { RootCandidate } from "../src/lib/graph/roots.ts";
import {
  acceptRootPicker,
  cancelRootPicker,
  chooseRoot as chooseRootFromPicker,
  customRootEntry,
  moveRootPicker,
  paintRootPicker as paintRootPickerContent,
  pickerIndex,
  type RootPickerActions,
  type RootPickerState,
} from "./root-picker.ts";
import { loadRoots as loadRootsFromSource } from "./roots-source.ts";
import { createJumpBridge } from "./jump-bridge.ts";
import {
  reportEntryCandidates as reportEntryCandidatesFlow,
  setEntry as setEntryFlow,
  type EntryFlowHost,
} from "./entry-flow.ts";
import { byteToChar, hexToRgb, utf8Len } from "./text.ts";

const editor = getEditor();

type Backend = "cbm" | "scip";
const BACKENDS: Backend[] = ["cbm", "scip"];

// ── configuration (override via globalThis.CODE_NAV_* in your loader) ──────
const REPO =
  (globalThis as any).CODE_NAV_REPO ||
  "/home/n/document/code/gpen/gpen-js/rules/cbm/graph-ui-svelte";
const BUN = (globalThis as any).CODE_NAV_BUN || "/home/n/.bun/bin/bun";
const RENDER_SCRIPT = REPO + "/tui/render.ts";
const ENTRY_SCRIPT = REPO + "/tui/entries.ts";
const CACHE_LINK_SCRIPT = REPO + "/tui/cache-link.ts";
const CBM_PROJECT =
  (globalThis as any).CODE_NAV_CBM_PROJECT ||
  (globalThis as any).CODE_NAV_PROJECT ||
  "";
const SCIP_PROJECT =
  (globalThis as any).CODE_NAV_SCIP_PROJECT || (CBM_PROJECT ? CBM_PROJECT + "-scip" : "");
const CONFIG_ENTRY =
  (globalThis as any).CODE_NAV_ENTRY ||
  (globalThis as any).CODE_NAV_SYMBOL_ENTRY ||
  "";
const FRAME_MODE =
  (globalThis as any).CODE_NAV_FRAME_MODE === "static" ? "static" : "cbm";
const DEPTH = Number((globalThis as any).CODE_NAV_DEPTH || 2);
const DIRECTION = (globalThis as any).CODE_NAV_DIRECTION || "both";
const MAX_NODES = Number((globalThis as any).CODE_NAV_MAX_NODES || 60);
const BRIDGE_URL =
  (globalThis as any).CODE_NAV_BRIDGE || "http://127.0.0.1:9752";
const JUMP_TMP =
  (globalThis as any).CODE_NAV_JUMP_TMP || "/tmp/code-nav-jump.json";
const JUMP_CLIENT = REPO + "/tools/jump-client.ts";
const SYNC_KEY = "codeNav.syncOnWorkspaceChange";

const PANEL_MODE = "code-graph";
const SELECT_NS = "code-nav-sel";
const POLL_MS = 500;

interface WindowInfo {
  id: number;
  label: string;
  root: string;
  project_path: string;
}

interface BufferInfo {
  id: number;
  window_id: number;
  name: string;
  is_virtual?: boolean;
}

interface PanelState {
  backend: Backend;
  windowId: number;
  root: string;
  framePath: string;
  bufferId: number | null;
  frame: Frame | null;
  lineTexts: string[];
  lineStarts: number[];
  selectedNodeId: string | null;
  renderSeq: number;
  opening: boolean;
  config: ProjectConfig;
  entry: string;
  helpVisible: boolean;
  headerRows: number;
  picker: RootPickerState | null;
}

// ── state ─────────────────────────────────────────────────────────────────
const panels = new Map<string, PanelState>();
const lastBackend = new Map<number, Backend>();

function toolbarHit(panel: PanelState, column: number): void {
  const action = toolbarActionAt(panel.helpVisible, column);
  if (action) runToolbarAction(panel, action);
}

function runToolbarAction(panel: PanelState, action: ToolbarAction): void {
  if (action === "help") {
    toggleHelp(panel);
    return;
  }
  if (action === "entry") {
    void setEntry();
    return;
  }
  if (action === "reload") {
    void (async () => {
      if (await loadPanelConfig(panel)) await reloadFrame(panel);
    })();
    return;
  }
  if (panel.bufferId !== null) editor.closeBuffer(panel.bufferId, true);
}

// ── utilities ─────────────────────────────────────────────────────────────
function computeLineStarts(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += utf8Len(line) + 1; // '\n' appended by frameToEntries
  }
  return starts;
}

function panelKey(windowId: number, backend: Backend): string {
  return windowId + ":" + backend;
}

function panelName(backend: Backend): string {
  return sharedPanelName(backend);
}

function framePath(root: string, backend: Backend): string {
  return frameCachePath(root, backend);
}

async function loadPanelConfig(panel: PanelState): Promise<boolean> {
  try {
    const loaded = await loadOrCreateProjectConfig(panel.root, {
      // Fresh returns null for a missing file in the common case, but some
      // remote/virtual backends throw or return "". Treat both as absent so an
      // optional config never prevents the graph from opening.
      readFile: (path) => {
        try {
          const text = editor.readFile(path);
          return typeof text === "string" && text.trim() ? text : null;
        } catch {
          return null;
        }
      },
      writeFile: (path, content) => editor.writeFile(path, content),
    });
    panel.config = loaded.config;
    const resolved = backendConfig(panel.config, panel.backend);
    // Config wins on every reload; otherwise keep a prompt/session selection.
    if (resolved.symbolEntry) panel.entry = resolved.symbolEntry;
    else if (!panel.entry) panel.entry = CONFIG_ENTRY;
    return true;
  } catch (error) {
    paintError(panel, errorText(error));
    return false;
  }
}

function projectFor(panel: PanelState): string {
  const resolved = backendConfig(panel.config, panel.backend);
  return resolved.project || (panel.backend === "scip" ? SCIP_PROJECT : CBM_PROJECT);
}

function entryFor(panel: PanelState): string {
  const resolved = backendConfig(panel.config, panel.backend);
  return panel.entry || resolved.symbolEntry || CONFIG_ENTRY;
}

function activeWindow(): WindowInfo | null {
  const id = editor.activeWindow();
  return editor.listWindows().find((win) => win.id === id) ?? null;
}

function activeRoot(): string {
  return activeWindow()?.root || (globalThis as any).CODE_NAV_ROOT || REPO;
}

function stateFor(
  windowId: number,
  backend: Backend,
  root: string,
): PanelState {
  const key = panelKey(windowId, backend);
  const existing = panels.get(key);
  if (existing) {
    if (existing.root !== root) {
      existing.frame = null;
      existing.lineTexts = [];
      existing.lineStarts = [];
      existing.selectedNodeId = null;
      existing.renderSeq++;
      existing.config = {};
      existing.entry = CONFIG_ENTRY;
      existing.helpVisible = false;
      existing.headerRows = 0;
      existing.picker = null;
    }
    existing.root = root;
    existing.framePath = framePath(root, backend);
    return existing;
  }
  const created: PanelState = {
    backend,
    windowId,
    root,
    framePath: framePath(root, backend),
    bufferId: null,
    frame: null,
    lineTexts: [],
    lineStarts: [],
    selectedNodeId: null,
    renderSeq: 0,
    opening: false,
    config: {},
    entry: CONFIG_ENTRY,
    helpVisible: false,
    headerRows: 0,
    picker: null,
  };
  panels.set(key, created);
  return created;
}

function findPanelByBuffer(bufferId: number): PanelState | null {
  for (const panel of panels.values()) {
    if (panel.bufferId === bufferId) return panel;
  }
  return null;
}

function findBuffer(windowId: number, backend: Backend): BufferInfo | null {
  const name = panelName(backend);
  return (
    (editor.listBuffers() as BufferInfo[]).find(
      (buffer) =>
        buffer.window_id === windowId &&
        buffer.is_virtual === true &&
        buffer.name === name,
    ) ?? null
  );
}

/** Frame runs -> setVirtualBufferContent spans. Spans are not lines. */
function frameToEntries(value: Frame): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const runs of value.lines) {
    for (const run of runs) {
      const style: Record<string, unknown> = {};
      const rgb = run.fg ? hexToRgb(run.fg) : null;
      if (rgb) style.fg = rgb;
      if (run.bold) style.bold = true;
      entries.push(
        Object.keys(style).length > 0 ? { text: run.t, style } : { text: run.t },
      );
    }
    entries.push({ text: "\n" });
  }
  return entries;
}

function setPanelContent(
  panel: PanelState,
  lines: string[],
  entries: Record<string, unknown>[],
): void {
  panel.lineTexts = lines;
  panel.lineStarts = computeLineStarts(lines);
  editor.setVirtualBufferContent(panel.bufferId!, entries);
}

function paintHelp(panel: PanelState): void {
  if (panel.bufferId === null) return;
  panel.picker = null;
  panel.headerRows = HEADER_ROWS;
  panel.selectedNodeId = null;
  const lines = [...headerLines(panel.helpVisible), ...HELP_LINES, ""];
  const entries: Record<string, unknown>[] = headerEntries(panel.helpVisible);
  for (const line of HELP_LINES) entries.push({ text: line + "\n" });
  entries.push({ text: "\n" });
  editor.clearNamespace(panel.bufferId, SELECT_NS);
  setPanelContent(panel, lines, entries);
  extensionApi.setStatus("Code Graph: help · ? back · e entry · r reload · q close");
}

function toggleHelp(panel: PanelState): void {
  panel.helpVisible = !panel.helpVisible;
  if (panel.helpVisible) paintHelp(panel);
  else renderFrame(panel);
}

// ── root picker ────────────────────────────────────────────────────────────
function rootPickerActions(panel: PanelState): RootPickerActions {
  return {
    setContent: (lines, entries) => setPanelContent(panel, lines, entries),
    clearNamespace: () => {
      if (panel.bufferId !== null) editor.clearNamespace(panel.bufferId, SELECT_NS);
    },
    setStatus: (message) => extensionApi.setStatus(message),
    setEntry: (entry) => {
      panel.entry = entry;
    },
    reload: () => {
      void reloadFrame(panel);
    },
    renderFrame: () => renderFrame(panel),
    openSelected: openSelectedNode,
    promptEntry: () => promptEntry(panel),
  };
}

async function promptEntry(panel: PanelState): Promise<void> {
  const picked = await editor.prompt(
    "Code Graph entry (qualified name)",
    entryFor(panel),
  );
  if (!picked || !picked.trim()) {
    extensionApi.setStatus("Code Graph: entry unchanged");
    return;
  }
  panel.entry = picked.trim();
  extensionApi.setStatus("Code Graph: entry = " + panel.entry);
  await reloadFrame(panel);
}

function readFrame(path: string): Frame | null {
  const raw = editor.readFile(path);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Frame;
  if (!parsed || !Array.isArray(parsed.lines) || typeof parsed.nodeCount !== "number") {
    throw new Error("invalid frame JSON");
  }
  return parsed;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

/** Paint an error into the panel so a failed render never blocks the buffer. */
function paintError(panel: PanelState, detail: string): void {
  if (panel.bufferId === null) return;
  panel.frame = null;
  panel.selectedNodeId = null;
  panel.helpVisible = false;
  panel.headerRows = 0;
  panel.picker = null;
  panel.lineTexts = detail.replace(/\r\n/g, "\n").split("\n");
  panel.lineStarts = computeLineStarts(panel.lineTexts);
  editor.clearNamespace(panel.bufferId, SELECT_NS);
  const entries: Record<string, unknown>[] = [];
  for (const line of panel.lineTexts) {
    entries.push({ text: line });
    entries.push({ text: "\n" });
  }
  editor.setVirtualBufferContent(panel.bufferId, entries);
  extensionApi.setStatus("Code Graph: error · r retry · text is selectable/copyable");
}

function rebuildIndex(panel: PanelState, value: Frame): void {
  panel.frame = value;
  panel.lineTexts = value.lines.map((runs) => runs.map((run) => run.t).join(""));
  panel.lineStarts = computeLineStarts(panel.lineTexts);
  panel.selectedNodeId = null;
}

function clearSelection(panel: PanelState): void {
  if (panel.bufferId !== null) editor.clearNamespace(panel.bufferId, SELECT_NS);
  panel.selectedNodeId = null;
}

function findBox(panel: PanelState, id: string): NodeBox | null {
  if (!panel.frame || !panel.frame.nodes) return null;
  for (const box of panel.frame.nodes) if (box.id === id) return box;
  return null;
}

/** Paint a selection overlay over the node box and update the status line. */
function selectNode(panel: PanelState, id: string): void {
  const box = findBox(panel, id);
  if (!panel.frame || panel.bufferId === null || !box) return;
  panel.selectedNodeId = id;
  editor.clearNamespace(panel.bufferId, SELECT_NS);

  for (let row = box.y; row < box.y + box.height; row++) {
    const viewRow = row + panel.headerRows;
    const text = panel.lineTexts[viewRow] ?? "";
    const startChar = Math.max(0, Math.min(text.length, box.x));
    const endChar = Math.max(startChar, Math.min(text.length, box.x + box.width));
    if (endChar <= startChar) continue;
    const start = (panel.lineStarts[viewRow] ?? 0) + utf8Len(text.slice(0, startChar));
    const end = (panel.lineStarts[viewRow] ?? 0) + utf8Len(text.slice(0, endChar));
    if (end > start) {
      editor.addOverlay(panel.bufferId, SELECT_NS, start, end, {
        bg: [48, 58, 78],
        fg: [247, 193, 119],
        bold: true,
      });
    }
  }

  const meta = panel.frame.meta ? panel.frame.meta[id] : undefined;
  if (meta && meta.file) {
    const line = meta.line > 0 ? meta.line : 1;
    extensionApi.setStatus(
      "Code Graph (" +
        panel.backend +
        "): " +
        meta.label +
        " · " +
        (meta.kind || "node") +
        " · " +
        meta.file +
        ":" +
        line +
        "  (o/Enter open, e entry, r reload, q close)",
    );
  } else {
    extensionApi.setStatus(
      "Code Graph (" +
        panel.backend +
        "): " +
        (meta ? meta.label : id) +
        " (no file metadata)",
    );
  }
}

// ── panel rendering ───────────────────────────────────────────────────────
function renderFrame(panel: PanelState): void {
  if (panel.bufferId === null) return;
  let value: Frame | null;
  try {
    value = readFrame(panel.framePath);
  } catch (error) {
    paintError(panel, errorText(error));
    return;
  }
  if (!value) {
    paintError(panel, missingFrameMessage(panel));
    return;
  }

  rebuildIndex(panel, value);
  panel.helpVisible = false;
  panel.picker = null;
  panel.headerRows = HEADER_ROWS;
  // Content replacement invalidates byte offsets stored in old overlays.
  editor.clearNamespace(panel.bufferId, SELECT_NS);
  const lines = [...headerLines(panel.helpVisible), ...value.lines.map((runs) => runs.map((run) => run.t).join(""))];
  setPanelContent(panel, lines, [...headerEntries(panel.helpVisible), ...frameToEntries(value)]);
  extensionApi.setStatus(
    "Code Graph (" +
      panel.backend +
      "): " +
      value.nodeCount +
      " nodes · " +
      value.width +
      "×" +
      value.height +
      " · ? help · e entry · r reload · q close",
  );
}

function missingFrameMessage(panel: PanelState): string {
  if (FRAME_MODE === "static") {
    return (
      "Code Graph: no static frame at " +
      panel.framePath +
      " · generate it with tui/render.ts, or unset CODE_NAV_FRAME_MODE=static"
    );
  }
  return (
    "Code Graph: no frame at " +
    panel.framePath +
    " · press r to render (cbm mode)"
  );
}

async function ensureFrame(panel: PanelState): Promise<void> {
  if (panel.bufferId === null) return;
  if (panel.frame) {
    renderFrame(panel);
    await linkFrameCache(panel);
    return;
  }
  try {
    if (readFrame(panel.framePath)) {
      renderFrame(panel);
      await linkFrameCache(panel);
      return;
    }
  } catch {
    // Let renderFrame report the parse error.
    renderFrame(panel);
    return;
  }
  if (FRAME_MODE === "static") {
    extensionApi.setStatus(missingFrameMessage(panel));
    return;
  }
  await reloadFrame(panel);
}

async function openPanel(backend: Backend, focus: boolean): Promise<void> {
  const win = activeWindow();
  if (!win) {
    extensionApi.setStatus("Code Graph: no active workspace window");
    return;
  }
  const panel = stateFor(win.id, backend, win.root);
  lastBackend.set(win.id, backend);

  if (panel.bufferId === null) {
    const existing = findBuffer(win.id, backend);
    if (existing) panel.bufferId = existing.id;
  }

  if (panel.bufferId !== null) {
    if (focus) editor.showBuffer(panel.bufferId);
    if (!(await loadPanelConfig(panel))) return;
    await ensureFrame(panel);
    return;
  }
  if (panel.opening) return;
  panel.opening = true;
  try {
    const result = await editor.createVirtualBuffer({
      name: panelName(backend),
      mode: PANEL_MODE,
      readOnly: true,
      editingDisabled: true,
      showCursors: true,
      showLineNumbers: false,
      // Sync-on-workspace-change opens panels without taking the reader away
      // from the file they were editing.
      background: !focus,
    });
    panel.bufferId =
      result && typeof result.bufferId === "number"
        ? result.bufferId
        : (result as any);
    panel.renderSeq++;
  } catch (error) {
    extensionApi.setStatus("Code Graph: cannot open panel — " + String(error));
    return;
  } finally {
    panel.opening = false;
  }
  if (!(await loadPanelConfig(panel))) return;
  await ensureFrame(panel);
}

async function reloadFrame(panel: PanelState): Promise<void> {
  if (panel.bufferId === null) {
    extensionApi.setStatus("Code Graph: open the graph panel first");
    return;
  }
  if (FRAME_MODE === "static") {
    extensionApi.setStatus(
      "Code Graph: static frame mode; regenerate " + panel.framePath + " externally",
    );
    return;
  }
  if (!projectFor(panel)) {
    paintError(
      panel,
      "Code Graph: no " +
        panel.backend +
        " project configured.\n" +
        "Set backends." +
        panel.backend +
        ".project in " +
        panel.root +
        "/code-graph.config.jsonc, then press r.\n" +
        "Example: { \"backends\": { \"" +
        panel.backend +
        "\": { \"project\": \"my-project\" } } }",
    );
    return;
  }
  if (!entryFor(panel)) {
    await reportEntryCandidates(panel);
    return;
  }

  const mySeq = ++panel.renderSeq;
  extensionApi.setStatus("Code Graph (" + panel.backend + "): rendering frame…");

  const args = [
    RENDER_SCRIPT,
    "--project",
    projectFor(panel),
    "--symbol-entry",
    entryFor(panel),
    "--depth",
    String(DEPTH),
    "--direction",
    DIRECTION,
    "--max-nodes",
    String(MAX_NODES),
    "--out",
    panel.framePath,
  ];

  let result: { exit_code?: number; stderr?: string } | null = null;
  try {
    result = (await editor.spawnProcess(BUN, args, panel.root)) as {
      exit_code?: number;
      stderr?: string;
    };
  } catch (error) {
    if (mySeq !== panel.renderSeq || panel.bufferId === null) return;
    paintError(panel, errorText(error));
    return;
  }

  if (!result || result.exit_code !== 0) {
    if (mySeq !== panel.renderSeq || panel.bufferId === null) return;
    paintError(panel, (result && result.stderr) || "render failed without stderr");
    return;
  }
  if (mySeq !== panel.renderSeq || panel.bufferId === null) return;
  renderFrame(panel);
  await linkFrameCache(panel);
}

async function linkFrameCache(panel: PanelState): Promise<void> {
  try {
    const result = (await editor.spawnProcess(
      BUN,
      [
        CACHE_LINK_SCRIPT,
        "--frame",
        panel.framePath,
        "--root",
        panel.root,
        "--backend",
        panel.backend,
      ],
      panel.root,
    )) as { exit_code?: number; stderr?: string };
    if (result && result.exit_code !== 0) {
      // The workspace frame is still valid; a missing convenience symlink is
      // not worth replacing the graph status with an error.
      return;
    }
  } catch {
    // Same: the frame itself was written successfully.
  }
}

function loadRoots(panel: PanelState): Promise<RootCandidate[]> {
  return loadRootsFromSource(
    {
      readFile: (path) => editor.readFile(path),
      spawn: (args, cwd) => editor.spawnProcess(BUN, args, cwd) as Promise<any>,
      setStatus: (message) => extensionApi.setStatus(message),
    },
    {
      script: ENTRY_SCRIPT,
      root: panel.root,
      project: projectFor(panel),
      backend: panel.backend,
    },
  );
}

function entryFlowHost(panel: PanelState): EntryFlowHost {
  return {
    loadRoots: () => loadRoots(panel),
    paintRoots: (roots) =>
      paintRootPickerContent(panel, roots, 0, rootPickerActions(panel)),
    promptEntry: () => promptEntry(panel),
    setStatus: (message) => extensionApi.setStatus(message),
  };
}

function reportEntryCandidates(panel: PanelState): Promise<void> {
  return reportEntryCandidatesFlow(entryFlowHost(panel));
}

async function setEntry(): Promise<void> {
  const panel = activePanel();
  if (!panel) {
    extensionApi.setStatus("Code Graph: open a graph panel first");
    return;
  }
  await setEntryFlow(entryFlowHost(panel));
}

function activePanel(): PanelState | null {
  return findPanelByBuffer(editor.getActiveBufferId());
}

function openSelectedNode(): void {
  const panel = activePanel();
  if (!panel) return;
  if (panel.picker) {
    chooseRootFromPicker(panel, panel.picker.selected, rootPickerActions(panel));
    return;
  }
  if (!panel.frame || !panel.selectedNodeId) {
    extensionApi.setStatus("Code Graph: click a node first");
    return;
  }
  const meta = panel.frame.meta ? panel.frame.meta[panel.selectedNodeId] : undefined;
  if (!meta || !meta.file) {
    extensionApi.setStatus("Code Graph: that node has no file metadata");
    return;
  }
  (globalThis as any).CODE_NAV_ROOT = panel.root;
  (globalThis as any).CODE_NAV_BACKEND = panel.backend;
  const line = meta.line > 0 ? meta.line : 1;
  extensionApi.openLocation({ path: meta.file, line, column: 1 }).then(
    () => extensionApi.setStatus("Code Graph: opened " + meta.file + ":" + line),
    (error) =>
      extensionApi.setStatus(
        "Code Graph: could not open " + meta.file + " — " + String(error),
      ),
  );
}

// ── click / lifecycle ─────────────────────────────────────────────────────
function onClick(event: {
  buffer_id?: number | null;
  bufferId?: number | null;
  buffer_row?: number | null;
  buffer_col?: number | null;
  button?: string;
}): void {
  const bufferId = event.buffer_id ?? event.bufferId ?? null;
  if (bufferId === null) return;
  const panel = findPanelByBuffer(bufferId);
  if (!panel) return;
  if (event.button && event.button !== "left") return;
  if (typeof event.buffer_row !== "number" || typeof event.buffer_col !== "number") return;

  const row = event.buffer_row;
  const text = panel.lineTexts[row] ?? "";
  // buffer_col is a byte offset inside the row; boxes are character cells.
  const column = byteToChar(text, event.buffer_col);

  if (row < panel.headerRows) {
    if (row === 0) toolbarHit(panel, column);
    return;
  }
  if (panel.picker) {
    const index = pickerIndex(panel, row);
    if (index !== null) {
      chooseRootFromPicker(panel, index, rootPickerActions(panel));
    }
    return;
  }
  if (!panel.frame || panel.helpVisible) return;
  const frameRow = row - panel.headerRows;

  let hit: NodeBox | null = null;
  if (panel.frame.nodes) {
    for (const box of panel.frame.nodes) {
      if (
        frameRow >= box.y &&
        frameRow < box.y + box.height &&
        column >= box.x &&
        column < box.x + box.width
      ) {
        hit = box;
        break;
      }
    }
  }
  if (!hit) {
    clearSelection(panel);
    extensionApi.setStatus("Code Graph: blank (row " + frameRow + ", col " + column + ")");
    return;
  }
  selectNode(panel, hit.id);
}

function onBufferClosed(event: { buffer_id?: number; bufferId?: number }): void {
  const closed = event.buffer_id ?? event.bufferId ?? null;
  if (closed === null) return;
  for (const [key, panel] of panels) {
    if (panel.bufferId !== closed) continue;
    // Invalidate an in-flight render before dropping the state.
    panel.bufferId = null;
    panel.renderSeq++;
    panels.delete(key);
    return;
  }
}

function onActiveWindowChanged(): void {
  const win = activeWindow();
  if (!win) return;
  const sync = Boolean(editor.getGlobalState(SYNC_KEY) ?? false);
  if (!sync) return;
  const backend = lastBackend.get(win.id) ?? "cbm";
  void openPanel(backend, false);
}

// ── jump bridge (JSON-RPC via tools/jump-client.ts) ───────────────────────
const jumpBridge = createJumpBridge(
  {
    spawn: (args, cwd) => editor.spawnProcess(BUN, args, cwd) as Promise<any>,
    readFile: (path) => editor.readFile(path),
    activeRoot,
    setStatus: (message) => extensionApi.setStatus(message),
    openLocation: (target) =>
      extensionApi.openLocation({
        project: target.project,
        path: target.path,
        line: target.line,
        column: target.column,
        symbol: target.symbol,
      }),
  },
  { client: JUMP_CLIENT, baseUrl: BRIDGE_URL, out: JUMP_TMP },
);

function toggleSync(): void {
  const current = Boolean(editor.getGlobalState(SYNC_KEY) ?? false);
  const next = !current;
  editor.setGlobalState(SYNC_KEY, next);
  extensionApi.setStatus(
    "Code Graph: sync on workspace change " + (next ? "ON" : "OFF"),
  );
}

// ── registration ──────────────────────────────────────────────────────────
editor.defineMode(
  PANEL_MODE,
  [
    ["q", "close_buffer"],
    ["?", "code_nav_help"],
    ["r", "code_nav_reload"],
    ["e", "code_nav_set_entry"],
    ["o", "code_nav_open_node"],
    ["Return", "code_nav_pick_accept"],
    ["Up", "code_nav_pick_up"],
    ["Down", "code_nav_pick_down"],
    ["c", "code_nav_pick_custom"],
    ["Esc", "code_nav_pick_cancel"],
  ],
  true,
  false,
  true,
);

registerHandler("code_nav_open_cbm", () => openPanel("cbm", true));
registerHandler("code_nav_open_scip", () => openPanel("scip", true));
registerHandler("code_nav_reload", () => {
  const panel = activePanel();
  if (!panel) return;
  void (async () => {
    // A config error must be retried too; otherwise r falls back to the
    // default project and the entry lookup returns 404.
    if (await loadPanelConfig(panel)) await reloadFrame(panel);
  })();
});
registerHandler("code_nav_set_entry", () => {
  void setEntry();
});
registerHandler("code_nav_help", () => {
  const panel = activePanel();
  if (panel) toggleHelp(panel);
});
registerHandler("code_nav_open_node", openSelectedNode);
registerHandler("code_nav_pick_accept", () => {
  const panel = activePanel();
  if (panel) acceptRootPicker(panel, rootPickerActions(panel));
});
registerHandler("code_nav_pick_up", () => {
  const panel = activePanel();
  if (panel) moveRootPicker(panel, -1, rootPickerActions(panel));
});
registerHandler("code_nav_pick_down", () => {
  const panel = activePanel();
  if (panel) moveRootPicker(panel, 1, rootPickerActions(panel));
});
registerHandler("code_nav_pick_custom", () => {
  const panel = activePanel();
  if (panel) customRootEntry(panel, rootPickerActions(panel));
});
registerHandler("code_nav_pick_cancel", () => {
  const panel = activePanel();
  if (panel) cancelRootPicker(panel, rootPickerActions(panel));
});
registerHandler("code_nav_click", onClick);
registerHandler("code_nav_closed", onBufferClosed);
registerHandler("code_nav_active_window", onActiveWindowChanged);
registerHandler("code_nav_poll", () => jumpBridge.poll());
registerHandler("code_nav_toggle_sync", toggleSync);

editor.registerCommand(
  "Code Graph: Open (cbm)",
  "Open the cbm-native call graph in a new tab",
  "code_nav_open_cbm",
  null,
);
editor.registerCommand(
  "Code Graph: Open (SCIP)",
  "Open the scip-cbm-writer call graph in a new tab",
  "code_nav_open_scip",
  null,
);
editor.registerCommand(
  "Code Graph: Show Keys",
  "Show the Code Graph keyboard and mouse actions",
  "code_nav_help",
  null,
);
editor.registerCommand(
  "Code Graph: Set Entry",
  "Change the root symbol of the active Code Graph panel",
  "code_nav_set_entry",
  null,
);
editor.registerCommand(
  "Code Graph: Toggle Sync On Workspace Change",
  "Open the last Code Graph panel when the active workspace changes",
  "code_nav_toggle_sync",
  null,
);
editor.on("mouse_click", "code_nav_click");
editor.on("buffer_closed", "code_nav_closed");
editor.on("active_window_changed", "code_nav_active_window");
editor.setInterval(POLL_MS, "code_nav_poll");
