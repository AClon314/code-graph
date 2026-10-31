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
const CBM_URL =
  (globalThis as any).CODE_NAV_CBM || "http://127.0.0.1:9749";
const CBM_PROJECT =
  (globalThis as any).CODE_NAV_CBM_PROJECT ||
  (globalThis as any).CODE_NAV_PROJECT ||
  "demo";
const SCIP_PROJECT =
  (globalThis as any).CODE_NAV_SCIP_PROJECT || CBM_PROJECT + "-scip";
const CONFIG_ENTRY =
  (globalThis as any).CODE_NAV_ENTRY ||
  (globalThis as any).CODE_NAV_SYMBOL ||
  "";
let entry = CONFIG_ENTRY;
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

// ── frame types (kept local; the sandbox cannot import) ────────────────────
interface Run {
  t: string;
  fg?: string;
  bold?: boolean;
}
interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface NodeMeta {
  label: string;
  kind: string;
  file: string;
  line: number;
  qn?: string;
}
interface Frame {
  width: number;
  height: number;
  nodeCount: number;
  lines: Run[][];
  nodes?: NodeBox[];
  meta?: Record<string, NodeMeta>;
}

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
}

// ── state ─────────────────────────────────────────────────────────────────
const panels = new Map<string, PanelState>();
const lastBackend = new Map<number, Backend>();
let bridgeInFlight = false;
let bridgeErrorShown = false;
let lastJumpKey = "";

// ── utilities ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  const value = hex.charAt(0) === "#" ? hex.slice(1) : hex;
  if (value.length !== 6) return null;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if (r !== r || g !== g || b !== b) return null;
  return [r, g, b];
}

function utf8Len(value: string): number {
  let count = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    count += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return count;
}

function byteToChar(value: string, byteColumn: number): number {
  let bytes = 0;
  let chars = 0;
  for (const ch of value) {
    if (bytes >= byteColumn) return chars;
    bytes += utf8Len(ch);
    chars++;
  }
  return chars;
}

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

function projectFor(backend: Backend): string {
  return backend === "scip" ? SCIP_PROJECT : CBM_PROJECT;
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

function readFrame(path: string): Frame | null {
  const raw = editor.readFile(path);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Frame;
  if (!parsed || !Array.isArray(parsed.lines) || typeof parsed.nodeCount !== "number") {
    throw new Error("invalid frame JSON");
  }
  return parsed;
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
    const text = panel.lineTexts[row] ?? "";
    const startChar = Math.max(0, Math.min(text.length, box.x));
    const endChar = Math.max(startChar, Math.min(text.length, box.x + box.width));
    if (endChar <= startChar) continue;
    const start = (panel.lineStarts[row] ?? 0) + utf8Len(text.slice(0, startChar));
    const end = (panel.lineStarts[row] ?? 0) + utf8Len(text.slice(0, endChar));
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
        "  (o/Enter open, r reload, q close)",
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
    extensionApi.setStatus("Code Graph: cannot read frame — " + String(error));
    return;
  }
  if (!value) {
    extensionApi.setStatus(missingFrameMessage(panel));
    return;
  }

  rebuildIndex(panel, value);
  // Content replacement invalidates byte offsets stored in old overlays.
  editor.clearNamespace(panel.bufferId, SELECT_NS);
  editor.setVirtualBufferContent(panel.bufferId, frameToEntries(value));
  extensionApi.setStatus(
    "Code Graph (" +
      panel.backend +
      "): " +
      value.nodeCount +
      " nodes · " +
      value.width +
      "×" +
      value.height +
      " · r reload · q close",
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
      showCursors: false,
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
  if (!entry) {
    await reportEntryCandidates(panel);
    return;
  }

  const mySeq = ++panel.renderSeq;
  extensionApi.setStatus("Code Graph (" + panel.backend + "): rendering frame…");

  const args = [
    RENDER_SCRIPT,
    "--cbm",
    CBM_URL,
    "--project",
    projectFor(panel.backend),
    "--symbol",
    entry,
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
    extensionApi.setStatus("Code Graph: render process failed — " + String(error));
    return;
  }

  if (!result || result.exit_code !== 0) {
    const first = ((result && result.stderr) || "").split("\n")[0] || "unknown error";
    extensionApi.setStatus("Code Graph: render failed — " + first);
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

async function reportEntryCandidates(panel: PanelState): Promise<void> {
  extensionApi.setStatus(
    "Code Graph (" +
      panel.backend +
      "): no entry configured; looking for candidates…",
  );
  const args = [
    ENTRY_SCRIPT,
    "--cbm",
    CBM_URL,
    "--project",
    projectFor(panel.backend),
    "--json",
    "--limit",
    "8",
  ];
  let result: { exit_code?: number; stdout?: string; stderr?: string } | null = null;
  try {
    result = (await editor.spawnProcess(BUN, args, panel.root)) as {
      exit_code?: number;
      stdout?: string;
      stderr?: string;
    };
  } catch (error) {
    extensionApi.setStatus("Code Graph: entry lookup failed — " + String(error));
    return;
  }
  if (!result || result.exit_code !== 0) {
    const detail = ((result && result.stderr) || "").split("\n")[0] || "unknown error";
    extensionApi.setStatus("Code Graph: entry lookup failed — " + detail);
    return;
  }
  let candidates: Array<{ qualifiedName?: string }> = [];
  try {
    candidates = JSON.parse(result.stdout || "[]") as Array<{ qualifiedName?: string }>;
  } catch {
    extensionApi.setStatus("Code Graph: entry lookup returned invalid JSON");
    return;
  }
  const names = candidates
    .map((candidate) => candidate.qualifiedName)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) {
    extensionApi.setStatus(
      "Code Graph: no entry candidates found; set CODE_NAV_ENTRY or CODE_NAV_SYMBOL manually",
    );
    return;
  }
  const picked = await editor.prompt(
    "Code Graph entry (qualified name)",
    names[0] ?? "",
  );
  if (!picked || !picked.trim()) {
    extensionApi.setStatus(
      "Code Graph: entry not selected · candidates: " + names.slice(0, 6).join(", "),
    );
    return;
  }
  entry = picked.trim();
  extensionApi.setStatus("Code Graph: entry = " + entry);
  await reloadFrame(panel);
}

function activePanel(): PanelState | null {
  return findPanelByBuffer(editor.getActiveBufferId());
}

function openSelectedNode(): void {
  const panel = activePanel();
  if (!panel || !panel.frame || !panel.selectedNodeId) {
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
  if (!panel || !panel.frame) return;
  if (event.button && event.button !== "left") return;
  if (typeof event.buffer_row !== "number" || typeof event.buffer_col !== "number") return;

  const row = event.buffer_row;
  const text = panel.lineTexts[row] ?? "";
  // buffer_col is a byte offset inside the row; boxes are character cells.
  const column = byteToChar(text, event.buffer_col);

  let hit: NodeBox | null = null;
  if (panel.frame.nodes) {
    for (const box of panel.frame.nodes) {
      if (
        row >= box.y &&
        row < box.y + box.height &&
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
    extensionApi.setStatus("Code Graph: blank (row " + row + ", col " + column + ")");
    return;
  }
  selectNode(panel, hit.id);
}

function onBufferClosed(event: { buffer_id?: number; bufferId?: number }): void {
  const closed = event.buffer_id ?? event.bufferId ?? null;
  if (closed === null) return;
  for (const [key, panel] of panels) {
    if (panel.bufferId !== closed) continue;
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
function bridgeError(result: { exit_code?: number; stderr?: string } | null): void {
  if (bridgeErrorShown) return;
  bridgeErrorShown = true;
  const detail = result
    ? "exit " + result.exit_code + (result.stderr ? " " + result.stderr.split("\n")[0] : "")
    : "transport error";
  extensionApi.setStatus("Code Graph: jump bridge unavailable (" + detail + ")");
}

async function pollBridge(): Promise<void> {
  if (bridgeInFlight) return;
  bridgeInFlight = true;
  try {
    // Fresh's httpFetch is GET-only; a spawned helper performs the JSON-RPC
    // POST and writes the target (or `null`) atomically to JUMP_TMP.
    const args = [
      JUMP_CLIENT,
      "next",
      "--client",
      "fresh",
      "--wait",
      "25000",
      "--base",
      BRIDGE_URL,
      "--out",
      JUMP_TMP,
    ];
    const result = (await editor.spawnProcess(BUN, args, activeRoot())) as {
      exit_code?: number;
      stderr?: string;
    };
    if (!result || result.exit_code !== 0) {
      bridgeError(result);
      return;
    }
    bridgeErrorShown = false;

    const raw = editor.readFile(JUMP_TMP);
    if (!raw) return;
    let parsed: JumpTarget | null;
    try {
      parsed = JSON.parse(raw) as JumpTarget | null;
    } catch {
      return;
    }
    if (!parsed) return; // long-poll elapsed without a target
    const target = parsed;
    if (
      typeof target.path !== "string" ||
      target.path.length === 0 ||
      typeof target.line !== "number" ||
      target.line < 1
    ) {
      return;
    }

    const column = typeof target.column === "number" && target.column > 0 ? target.column : 1;
    const key = [target.project || "", target.path, target.line, column, target.symbol || ""].join("|");
    if (key === lastJumpKey) return; // do not reopen the same jump repeatedly
    lastJumpKey = key;

    (globalThis as any).CODE_NAV_ROOT = activeRoot();
    extensionApi
      .openLocation({
        project: target.project,
        path: target.path,
        line: target.line,
        column,
        symbol: target.symbol,
      })
      .then(
        () => extensionApi.setStatus("Code Graph: jumped to " + target.path + ":" + target.line),
        (error) =>
          extensionApi.setStatus(
            "Code Graph: could not open " + target.path + " — " + String(error),
          ),
      );
  } catch (error) {
    if (!bridgeErrorShown) {
      bridgeErrorShown = true;
      extensionApi.setStatus("Code Graph: jump bridge error — " + String(error));
    }
  } finally {
    bridgeInFlight = false;
  }
}

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
    ["r", "code_nav_reload"],
    ["o", "code_nav_open_node"],
    ["Return", "code_nav_open_node"],
  ],
  true,
);

registerHandler("code_nav_open_cbm", () => openPanel("cbm", true));
registerHandler("code_nav_open_scip", () => openPanel("scip", true));
registerHandler("code_nav_reload", () => {
  const panel = activePanel();
  if (panel) void reloadFrame(panel);
});
registerHandler("code_nav_open_node", openSelectedNode);
registerHandler("code_nav_click", onClick);
registerHandler("code_nav_closed", onBufferClosed);
registerHandler("code_nav_active_window", onActiveWindowChanged);
registerHandler("code_nav_poll", pollBridge);
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
  "Code Graph: Toggle Sync On Workspace Change",
  "Open the last Code Graph panel when the active workspace changes",
  "code_nav_toggle_sync",
  null,
);
editor.on("mouse_click", "code_nav_click");
editor.on("buffer_closed", "code_nav_closed");
editor.on("active_window_changed", "code_nav_active_window");
editor.setInterval(POLL_MS, "code_nav_poll");
