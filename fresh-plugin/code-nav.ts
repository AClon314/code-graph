// code-nav.ts — Fresh plugin (QuickJS sandbox).
//
// The plugin does NOT lay out or render a graph. Bun runs tui/render.ts
// (orchgraph + ELK) and writes a frame JSON; this file only paints that frame
// into a virtual buffer and implements the code-navigator interactions.
//
// QuickJS rules: no runtime imports, no Node APIs, no DOM. The shared host
// adapter is bundled into this file; only editor.* calls and the global
// registerHandler-style helpers that Fresh exposes are available.
//
// Usage:
//   Ctrl+P -> "Code Nav: Open Graph"
//   panel: click node = select, o/Enter = open file:line, r = re-render, q = close
//   jumps: the GUI POSTs JSON-RPC to tools/jump-bridge.ts; this plugin spawns
//   tools/jump-client.ts (Fresh httpFetch is GET-only, so it cannot POST).

import { extensionApi } from "../src/extension/host.ts";
import type { JumpTarget } from "../src/lib/jump/types";

const editor = getEditor();

// ── configuration (override via globalThis.CODE_NAV_* in your loader) ──────
const REPO =
  (globalThis as any).CODE_NAV_REPO ||
  "/home/n/document/code/gpen/gpen-js/rules/cbm/graph-ui-svelte";
const BUN = (globalThis as any).CODE_NAV_BUN || "/home/n/.bun/bin/bun";
const FRAME_PATH = (globalThis as any).CODE_NAV_FRAME || REPO + "/tui/frame.json";
const RENDER_SCRIPT = REPO + "/tui/render.ts";
const BRIDGE_URL = (globalThis as any).CODE_NAV_BRIDGE || "http://127.0.0.1:9752";
const JUMP_TMP = (globalThis as any).CODE_NAV_JUMP_TMP || "/tmp/code-nav-jump.json";
const JUMP_CLIENT = REPO + "/tools/jump-client.ts";

// Edit this (or set CODE_NAV_RENDER_ARGS) to use live cbm data instead of the
// fixture. Example:
//   [RENDER_SCRIPT, "--cbm", "http://127.0.0.1:9749", "--project", "p",
//    "--symbol", "pkg.fn", "--depth", "2", "--direction", "both",
//    "--out", FRAME_PATH]
const DEFAULT_RENDER_ARGS = [
  RENDER_SCRIPT,
  "--graph",
  REPO + "/tui/fixture-graph.json",
  "--out",
  FRAME_PATH,
];
const RENDER_ARGS: string[] = Array.isArray((globalThis as any).CODE_NAV_RENDER_ARGS)
  ? ((globalThis as any).CODE_NAV_RENDER_ARGS as string[])
  : DEFAULT_RENDER_ARGS;

const PANEL_NAME = " *Code Graph* ";
const MODE = "code-nav";
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

// ── state ─────────────────────────────────────────────────────────────────
let bufferId: number | null = null;
let opening = false;
let renderSeq = 0;
let frame: Frame | null = null;
let lineTexts: string[] = [];
let lineStarts: number[] = [];
let selectedNodeId: string | null = null;
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

/** Frame runs -> setVirtualBufferContent spans. Spans are not lines. */
function frameToEntries(value: Frame): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const runs of value.lines) {
    for (const run of runs) {
      const style: Record<string, unknown> = {};
      const rgb = run.fg ? hexToRgb(run.fg) : null;
      if (rgb) style.fg = rgb;
      if (run.bold) style.bold = true;
      entries.push(Object.keys(style).length > 0 ? { text: run.t, style } : { text: run.t });
    }
    entries.push({ text: "\n" });
  }
  return entries;
}

function readFrame(): Frame | null {
  const raw = editor.readFile(FRAME_PATH);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Frame;
  if (!parsed || !Array.isArray(parsed.lines) || typeof parsed.nodeCount !== "number") {
    throw new Error("invalid frame JSON");
  }
  return parsed;
}

function rebuildIndex(value: Frame): void {
  frame = value;
  lineTexts = value.lines.map((runs) => runs.map((run) => run.t).join(""));
  lineStarts = computeLineStarts(lineTexts);
  selectedNodeId = null;
}

function clearSelection(): void {
  if (bufferId !== null) editor.clearNamespace(bufferId, SELECT_NS);
  selectedNodeId = null;
}

function findBox(id: string): NodeBox | null {
  if (!frame || !frame.nodes) return null;
  for (const box of frame.nodes) if (box.id === id) return box;
  return null;
}

/** Paint a selection overlay over the node box and update the status line. */
function selectNode(id: string): void {
  const box = findBox(id);
  if (!frame || bufferId === null || !box) return;
  selectedNodeId = id;
  editor.clearNamespace(bufferId, SELECT_NS);

  for (let row = box.y; row < box.y + box.height; row++) {
    const text = lineTexts[row] ?? "";
    const startChar = Math.max(0, Math.min(text.length, box.x));
    const endChar = Math.max(startChar, Math.min(text.length, box.x + box.width));
    if (endChar <= startChar) continue;
    const start = (lineStarts[row] ?? 0) + utf8Len(text.slice(0, startChar));
    const end = (lineStarts[row] ?? 0) + utf8Len(text.slice(0, endChar));
    if (end > start) {
      editor.addOverlay(bufferId, SELECT_NS, start, end, {
        bg: [48, 58, 78],
        fg: [247, 193, 119],
        bold: true,
      });
    }
  }

  const meta = frame.meta ? frame.meta[id] : undefined;
  if (meta && meta.file) {
    const line = meta.line > 0 ? meta.line : 1;
    extensionApi.setStatus(
      "Code Nav: " +
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
    extensionApi.setStatus("Code Nav: " + (meta ? meta.label : id) + " (no file metadata)");
  }
}

// ── panel rendering ───────────────────────────────────────────────────────
function renderFrame(): void {
  if (bufferId === null) return;
  let value: Frame | null;
  try {
    value = readFrame();
  } catch (error) {
    extensionApi.setStatus("Code Nav: cannot read frame — " + String(error));
    return;
  }
  if (!value) {
    extensionApi.setStatus("Code Nav: no frame at " + FRAME_PATH + " (press r to render)");
    return;
  }

  rebuildIndex(value);
  // Content replacement invalidates byte offsets stored in old overlays.
  editor.clearNamespace(bufferId, SELECT_NS);
  editor.setVirtualBufferContent(bufferId, frameToEntries(value));
  extensionApi.setStatus(
    "Code Nav: " +
      value.nodeCount +
      " nodes · " +
      value.width +
      "×" +
      value.height +
      " · r reload · q close",
  );
}

async function openPanel(): Promise<void> {
  if (bufferId === null) {
    const existing = editor
      .listBuffers()
      .find((buffer) => buffer.is_virtual === true && buffer.name === PANEL_NAME);
    if (existing) bufferId = existing.id;
  }
  if (bufferId !== null) {
    renderSeq++;
    editor.showBuffer(bufferId);
    renderFrame();
    return;
  }
  if (opening) return;
  opening = true;
  try {
    // A new tab in the current split, not a split pane: the graph is a view
    // the user asked for, and it should not shrink the file they were editing.
    const result = await editor.createVirtualBuffer({
      name: PANEL_NAME,
      mode: MODE,
      readOnly: true,
      editingDisabled: true,
      showCursors: false,
      showLineNumbers: false,
    });
    bufferId = result && typeof result.bufferId === "number" ? result.bufferId : (result as any);
    renderSeq++;
  } catch (error) {
    extensionApi.setStatus("Code Nav: cannot open panel — " + String(error));
    return;
  } finally {
    opening = false;
  }
  renderFrame();
}

async function reloadFrame(): Promise<void> {
  if (bufferId === null) {
    extensionApi.setStatus("Code Nav: open the graph panel first");
    return;
  }
  const mySeq = renderSeq;
  extensionApi.setStatus("Code Nav: rendering frame…");

  let result: { exit_code?: number; stderr?: string } | null = null;
  try {
    result = (await editor.spawnProcess(BUN, RENDER_ARGS, REPO)) as {
      exit_code?: number;
      stderr?: string;
    };
  } catch (error) {
    extensionApi.setStatus("Code Nav: render process failed — " + String(error));
    return;
  }

  if (!result || result.exit_code !== 0) {
    const first = ((result && result.stderr) || "").split("\n")[0] || "unknown error";
    extensionApi.setStatus("Code Nav: render failed — " + first);
    return;
  }
  if (mySeq !== renderSeq || bufferId === null) return;
  renderFrame();
}

function openSelectedNode(): void {
  if (!frame || !selectedNodeId) {
    extensionApi.setStatus("Code Nav: click a node first");
    return;
  }
  const meta = frame.meta ? frame.meta[selectedNodeId] : undefined;
  if (!meta || !meta.file) {
    extensionApi.setStatus("Code Nav: that node has no file metadata");
    return;
  }
  const line = meta.line > 0 ? meta.line : 1;
  extensionApi
    .openLocation({ path: meta.file, line, column: 1 })
    .then(
      () => extensionApi.setStatus("Code Nav: opened " + meta.file + ":" + line),
      (error) =>
        extensionApi.setStatus(
          "Code Nav: could not open " + meta.file + " — " + String(error),
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
  if (bufferId === null || !frame) return;
  const clickedBuffer = event.buffer_id ?? event.bufferId ?? null;
  if (clickedBuffer !== bufferId) return;
  if (event.button && event.button !== "left") return;
  if (typeof event.buffer_row !== "number" || typeof event.buffer_col !== "number") return;

  const row = event.buffer_row;
  const text = lineTexts[row] ?? "";
  // buffer_col is a byte offset inside the row; boxes are character cells.
  const column = byteToChar(text, event.buffer_col);

  let hit: NodeBox | null = null;
  if (frame.nodes) {
    for (const box of frame.nodes) {
      if (row >= box.y && row < box.y + box.height && column >= box.x && column < box.x + box.width) {
        hit = box;
        break;
      }
    }
  }
  if (!hit) {
    clearSelection();
    extensionApi.setStatus("Code Nav: blank (row " + row + ", col " + column + ")");
    return;
  }
  selectNode(hit.id);
}

function onBufferClosed(event: { buffer_id?: number; bufferId?: number }): void {
  const closed = event.buffer_id ?? event.bufferId ?? null;
  if (closed !== bufferId) return;
  bufferId = null;
  renderSeq++;
  frame = null;
  lineTexts = [];
  lineStarts = [];
  selectedNodeId = null;
}

// ── jump bridge (JSON-RPC via tools/jump-client.ts) ───────────────────────
function bridgeError(result: { exit_code?: number; stderr?: string } | null): void {
  if (bridgeErrorShown) return;
  bridgeErrorShown = true;
  const detail = result
    ? "exit " + result.exit_code + (result.stderr ? " " + result.stderr.split("\n")[0] : "")
    : "transport error";
  extensionApi.setStatus("Code Nav: jump bridge unavailable (" + detail + ")");
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
    const result = (await editor.spawnProcess(BUN, args, REPO)) as {
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

    extensionApi
      .openLocation({
        project: target.project,
        path: target.path,
        line: target.line,
        column,
        symbol: target.symbol,
      })
      .then(
        () => extensionApi.setStatus("Code Nav: jumped to " + target.path + ":" + target.line),
        (error) =>
          extensionApi.setStatus(
            "Code Nav: could not open " + target.path + " — " + String(error),
          ),
      );
  } catch (error) {
    if (!bridgeErrorShown) {
      bridgeErrorShown = true;
      extensionApi.setStatus("Code Nav: jump bridge error — " + String(error));
    }
  } finally {
    bridgeInFlight = false;
  }
}

// ── registration ──────────────────────────────────────────────────────────
editor.defineMode(
  MODE,
  [
    ["q", "close_buffer"],
    ["r", "code_nav_reload"],
    ["o", "code_nav_open_node"],
    ["Return", "code_nav_open_node"],
  ],
  true,
);

registerHandler("code_nav_open_panel", openPanel);
registerHandler("code_nav_reload", reloadFrame);
registerHandler("code_nav_open_node", openSelectedNode);
registerHandler("code_nav_click", onClick);
registerHandler("code_nav_closed", onBufferClosed);
registerHandler("code_nav_poll", pollBridge);

editor.registerCommand(
  "Code Nav: Open Graph",
  "Open the precomputed code graph in a new tab",
  "code_nav_open_panel",
  null,
);
editor.on("mouse_click", "code_nav_click");
editor.on("buffer_closed", "code_nav_closed");
editor.setInterval(POLL_MS, "code_nav_poll");
