/**
 * GraphViewData -> orchgraph -> a plain JSON frame that a QuickJS plugin can
 * paint into a virtual buffer.
 *
 * Why two stages: orchgraph (ELK layout) needs npm packages, while Fresh's
 * plugin sandbox has no imports. Everything in this file runs under Bun; the
 * Fresh plugin only reads the resulting `Frame`.
 */

import {
  layoutGraph,
  renderTerminalCanvas,
  renderTerminalGraph,
  style,
} from "orchgraph";
import type {
  GraphDirection,
  GraphDocument,
  NodeState,
  TerminalCanvas,
} from "orchgraph";

import { toGraphDocument } from "../src/lib/graph/orchgraph.ts";
import type { GraphViewData } from "../src/lib/graph/types.ts";

/** A styled run of text. ANSI is already stripped; `fg` is `#rrggbb`. */
export interface FrameRun {
  t: string;
  fg?: string;
  bold?: boolean;
}

/** Node geometry in terminal cells (0-based row/column, border included). */
export interface FrameNodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadata used by the code navigator (`file:line`). */
export interface FrameNodeMeta {
  label: string;
  kind: string;
  file: string;
  line: number;
  qn: string;
}

export interface Frame {
  width: number;
  height: number;
  nodeCount: number;
  lines: FrameRun[][];
  nodes: FrameNodeBox[];
  meta: Record<string, FrameNodeMeta>;
}

export interface BuildFrameOptions {
  /** ELK direction; defaults to DOWN. */
  direction?: GraphDirection;
  /** ELK spacing, clamped by orchgraph to 2..20. */
  spacing?: number;
  /** Maximum node width in terminal cells. */
  maxNodeWidth?: number;
}

const ANSI_16 = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
];

function hex2(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.trunc(value)));
  return clamped.toString(16).padStart(2, "0");
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function xterm256(index: number): string {
  if (!Number.isFinite(index) || index < 0 || index > 255) return "#c0c0c0";
  const n = Math.trunc(index);
  if (n < 16) return ANSI_16[n]!;
  if (n <= 231) {
    const value = n - 16;
    const level = (part: number): number => (part === 0 ? 0 : 55 + part * 40);
    return rgbHex(level(Math.floor(value / 36)), level(Math.floor((value % 36) / 6)), level(value % 6));
  }
  const gray = 8 + (n - 232) * 10;
  return rgbHex(gray, gray, gray);
}

interface SgrState {
  fg?: string;
  bold: boolean;
}

function applySgr(codes: number[], state: SgrState): void {
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) {
      state.fg = undefined;
      state.bold = false;
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 22) {
      state.bold = false;
    } else if (code >= 30 && code <= 37) {
      state.fg = ANSI_16[code - 30]!;
    } else if (code >= 90 && code <= 97) {
      state.fg = ANSI_16[code - 90 + 8]!;
    } else if (code === 39) {
      state.fg = undefined;
    } else if (code === 38) {
      const mode = codes[i + 1];
      if (mode === 5) {
        const index = codes[i + 2];
        if (index !== undefined) state.fg = xterm256(index);
        i += 2;
      } else if (mode === 2) {
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        if (r !== undefined && g !== undefined && b !== undefined) state.fg = rgbHex(r, g, b);
        i += 4;
      } else {
        i += 1;
      }
    } else if (code === 48) {
      // Background colour: the frame contract only carries foreground + bold.
      const mode = codes[i + 1];
      if (mode === 5) i += 2;
      else if (mode === 2) i += 4;
      else i += 1;
    }
  }
}

function trimTrailingBlank(runs: FrameRun[]): void {
  while (runs.length > 0) {
    const last = runs[runs.length - 1]!;
    const trimmed = last.t.replace(/[ \t]+$/, "");
    if (trimmed.length === 0) {
      runs.pop();
      continue;
    }
    last.t = trimmed;
    break;
  }
}

/**
 * Parse one ANSI-decorated terminal line into foreground/bold runs.
 *
 * Supported SGR: reset (0), bold (1/22), standard + bright foreground colours
 * (30-37/90-97), 256-colour (`38;5;n`) and truecolour (`38;2;r;g;b`). Every
 * escape sequence is removed from `t`, so the frame never contains ANSI.
 */
export function parseAnsiLine(line: string): FrameRun[] {
  const runs: FrameRun[] = [];
  const state: SgrState = { bold: false };
  let text = "";

  const flush = (): void => {
    if (text.length === 0) return;
    const previous = runs[runs.length - 1];
    if (previous && previous.fg === state.fg && Boolean(previous.bold) === state.bold) {
      previous.t += text;
    } else {
      const run: FrameRun = { t: text };
      if (state.fg) run.fg = state.fg;
      if (state.bold) run.bold = true;
      runs.push(run);
    }
    text = "";
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch !== "\u001b") {
      text += ch;
      continue;
    }

    flush();
    if (line[i + 1] !== "[") {
      // Not a CSI sequence; drop the escape byte only.
      continue;
    }

    let end = i + 2;
    while (end < line.length) {
      const code = line.charCodeAt(end);
      if (code >= 0x40 && code <= 0x7e) break;
      end++;
    }
    if (end >= line.length) {
      i = line.length;
      break;
    }

    const final = line[end]!;
    if (final === "m") {
      const raw = line.slice(i + 2, end);
      const codes = raw.length === 0
        ? [0]
        : raw.split(";").map((part) => (part === "" ? 0 : Number(part)));
      applySgr(codes, state);
    }
    i = end;
  }
  flush();
  trimTrailingBlank(runs);
  return runs;
}

function canvasNodeBoxes(canvas: TerminalCanvas): FrameNodeBox[] {
  return canvas.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }));
}

function canvasMeta(doc: GraphDocument): Record<string, FrameNodeMeta> {
  const meta: Record<string, FrameNodeMeta> = {};
  for (const node of doc.nodes) {
    const raw = (node.metadata ?? {}) as Record<string, unknown>;
    meta[node.id] = {
      label: node.label,
      kind: node.kind ?? "",
      file: typeof raw.file === "string" ? raw.file : "",
      line: typeof raw.line === "number" ? raw.line : 0,
      qn: typeof raw.qn === "string" ? raw.qn : node.id,
    };
  }
  return meta;
}

/**
 * Deterministic frame builder: same GraphViewData + options -> same JSON.
 *
 * The root node marker uses orchardgraph's `running` theme (yellow/bold) and
 * every other marker uses `idle` with a fixed gray, so frames always contain
 * at least one coloured run without inventing graph state.
 */
export async function buildFrame(
  view: GraphViewData,
  options: BuildFrameOptions = {},
): Promise<Frame> {
  const doc = toGraphDocument(view);
  if (doc.nodes.length === 0) throw new Error("graph has no nodes");

  const geometry = await layoutGraph(doc, {
    direction: options.direction ?? doc.direction ?? "DOWN",
    spacing: options.spacing ?? 3,
    maxNodeWidth: options.maxNodeWidth ?? 32,
  });
  const canvas = renderTerminalGraph(doc, geometry);

  const nodeStates: Record<string, NodeState> = {};
  for (const node of doc.nodes) {
    nodeStates[node.id] = node.id === view.root ? "running" : "idle";
  }

  const rendered = renderTerminalCanvas(canvas, {
    color: true,
    nodeStates,
    theme: { idle: style({ color: "gray" }) },
  });

  const lines = rendered.map(parseAnsiLine);
  return {
    width: canvas.width,
    height: lines.length,
    nodeCount: doc.nodes.length,
    lines,
    nodes: canvasNodeBoxes(canvas),
    meta: canvasMeta(doc),
  };
}
