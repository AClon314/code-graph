#!/usr/bin/env bun
/**
 * Render a code graph into the JSON frame consumed by fresh-plugin/code-nav.ts.
 *
 * Fixture / already-built graph (deterministic tests):
 *
 *   bun run tui/render.ts --graph tui/fixture-graph.json --out /tmp/code-graph-frame.json
 *
 * Live cbm data (small local BFS over callers/callees):
 *
 *   bun run tui/render.ts --cbm http://127.0.0.1:9749 --project my-project \
 *     --symbol 'pkg.mod.fn' --depth 2 --direction both --out /tmp/frame.json
 *
 * No src/ files are modified: this script only reads GraphViewData types and
 * CbmHttpSource.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildFrame } from "./frame.ts";
import type { BuildFrameOptions } from "./frame.ts";
import { CbmHttpSource } from "../src/lib/graph/cbm-http.ts";
import type { GraphDirection } from "orchgraph";
import type {
  SymbolBundle,
  SymbolConnection,
  SymbolNode,
} from "../src/lib/graph/types.ts";
import type { GraphViewData, GraphViewEdge, GraphViewNode } from "../src/lib/graph/types.ts";

type BfsDirection = "both" | "callers" | "callees";

interface CliArgs {
  graph?: string;
  cbm?: string;
  project?: string;
  symbol?: string;
  depth: number;
  direction: BfsDirection;
  maxNodes: number;
  out: string;
  layoutDirection?: GraphDirection;
  spacing?: number;
  maxNodeWidth?: number;
}

const USAGE = `usage:
  bun run tui/render.ts --graph <graph.json> --out <frame.json> [options]
  bun run tui/render.ts --cbm <url> --project <name> --symbol <qn> --out <frame.json> [options]

options:
  --depth <n>             BFS depth for --cbm (default 2)
  --direction <d>         both | callers | callees (default both)
  --max-nodes <n>         node budget for --cbm (default 60)
  --layout-direction <d>  DOWN | UP | LEFT | RIGHT (default DOWN)
  --spacing <n>           ELK spacing (default 3)
  --max-node-width <n>    node width cap in cells (default 32)
  --help                  show this help`;

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}

function nonNegativeInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} must be a non-negative integer`);
  return value;
}

function parseLayoutDirection(raw: string): GraphDirection {
  const value = raw.toUpperCase();
  if (value === "DOWN" || value === "UP" || value === "LEFT" || value === "RIGHT") return value;
  throw new Error("--layout-direction must be DOWN, UP, LEFT or RIGHT");
}

function parseBfsDirection(raw: string): BfsDirection {
  const value = raw.toLowerCase();
  if (value === "both") return "both";
  if (value === "in" || value === "callers" || value === "backward") return "callers";
  if (value === "out" || value === "callees" || value === "forward") return "callees";
  throw new Error("--direction must be both, callers or callees");
}

function parseArgs(argv: string[]): CliArgs | null {
  const args: CliArgs = {
    depth: 2,
    direction: "both",
    maxNodes: 60,
    out: resolve(import.meta.dir, "frame.json"),
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === "--help" || flag === "-h") return null;
    if (flag === "--graph") {
      args.graph = resolve(takeValue(argv, i, flag));
      i++;
    } else if (flag === "--out") {
      args.out = resolve(takeValue(argv, i, flag));
      i++;
    } else if (flag === "--cbm") {
      args.cbm = takeValue(argv, i, flag);
      i++;
    } else if (flag === "--project") {
      args.project = takeValue(argv, i, flag);
      i++;
    } else if (flag === "--symbol") {
      args.symbol = takeValue(argv, i, flag);
      i++;
    } else if (flag === "--depth") {
      args.depth = nonNegativeInt(takeValue(argv, i, flag), flag);
      i++;
    } else if (flag === "--direction") {
      args.direction = parseBfsDirection(takeValue(argv, i, flag));
      i++;
    } else if (flag === "--max-nodes") {
      const value = Number(takeValue(argv, i, flag));
      if (!Number.isInteger(value) || value < 1) throw new Error("--max-nodes must be a positive integer");
      args.maxNodes = value;
      i++;
    } else if (flag === "--layout-direction") {
      args.layoutDirection = parseLayoutDirection(takeValue(argv, i, flag));
      i++;
    } else if (flag === "--spacing") {
      const value = Number(takeValue(argv, i, flag));
      if (!Number.isFinite(value)) throw new Error("--spacing must be a number");
      args.spacing = value;
      i++;
    } else if (flag === "--max-node-width") {
      const value = Number(takeValue(argv, i, flag));
      if (!Number.isFinite(value)) throw new Error("--max-node-width must be a number");
      args.maxNodeWidth = value;
      i++;
    } else {
      throw new Error(`unknown option: ${flag}`);
    }
  }

  if (args.graph && args.cbm) throw new Error("use either --graph or --cbm, not both");
  if (!args.graph && !args.cbm) throw new Error("one of --graph or --cbm is required");
  if (args.cbm && (!args.project || !args.symbol)) {
    throw new Error("--cbm also needs --project and --symbol");
  }
  return args;
}

function loadView(path: string): GraphViewData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read graph ${path}: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${path} is not a GraphViewData object`);
  const raw = parsed as Partial<GraphViewData>;
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new Error(`${path}: nodes must be a non-empty array`);
  }
  const root = typeof raw.root === "string" && raw.root.length > 0 ? raw.root : raw.nodes[0]!.id;
  return {
    root,
    nodes: raw.nodes,
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    truncated: raw.truncated === true,
  };
}

function realQualifiedName(node: { qualifiedName?: string }): string | undefined {
  const qn = node.qualifiedName;
  return qn && qn !== "?" ? qn : undefined;
}

function nodeId(node: SymbolNode): string {
  const qn = realQualifiedName(node);
  if (qn) return qn;
  if (node.id !== undefined) return `#${node.id}`;
  return `${node.name}@${node.filePath ?? ""}:${node.startLine ?? 0}`;
}

function nodeRef(node: SymbolNode): string | undefined {
  const qn = realQualifiedName(node);
  if (qn) return qn;
  return node.id !== undefined ? `#${node.id}` : undefined;
}

function toViewNode(node: SymbolNode, id: string): GraphViewNode {
  return {
    id,
    label: node.label,
    name: node.name,
    qualifiedName: node.qualifiedName,
    filePath: node.filePath,
    startLine: node.startLine,
    endLine: node.endLine,
    docstring: node.docstring,
    isEntry: node.isEntry,
    isTest: node.isTest,
    isExported: node.isExported,
    symbolId: node.id,
  };
}

function connectionToSymbolNode(connection: SymbolConnection): SymbolNode {
  return {
    id: connection.id,
    label: connection.label,
    name: connection.name,
    qualifiedName: connection.qualifiedName,
    filePath: connection.filePath,
    startLine: connection.startLine,
  };
}

function edgeId(source: string, target: string, type: string, seen: Map<string, number>): string {
  const base = `${source}->${target}:${type}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}#${count + 1}`;
}

/**
 * Small local BFS over cbm callers/callees. Intentionally not shared with the
 * Svelte GUI (which owns its own neighborhood exploration); the TUI just needs
 * a small, deterministic node/edge budget.
 */
async function fetchCbmView(args: CliArgs): Promise<GraphViewData> {
  const source = new CbmHttpSource({ baseUrl: args.cbm!, project: args.project! });
  const rootBundle = await source.symbol(args.project!, args.symbol!);

  const nodeMap = new Map<string, GraphViewNode>();
  const ordered: GraphViewNode[] = [];
  const edgeList: GraphViewEdge[] = [];
  const edgeKeys = new Set<string>();
  const edgeIds = new Map<string, number>();
  const bundles = new Map<string, SymbolBundle>();
  let capHit = false;

  const addNode = (node: SymbolNode): GraphViewNode | null => {
    const id = nodeId(node);
    const existing = nodeMap.get(id);
    if (existing) return existing;
    if (ordered.length >= args.maxNodes) {
      capHit = true;
      return null;
    }
    const viewNode = toViewNode(node, id);
    nodeMap.set(id, viewNode);
    ordered.push(viewNode);
    return viewNode;
  };

  const addEdge = (sourceId: string, targetId: string, type: string): void => {
    if (!nodeMap.has(sourceId) || !nodeMap.has(targetId)) return;
    const key = `${sourceId}\u0000${targetId}\u0000${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edgeList.push({
      id: edgeId(sourceId, targetId, type, edgeIds),
      source: sourceId,
      target: targetId,
      type,
      label: type,
    });
  };

  const rootNode = rootBundle.node;
  const rootView = addNode(rootNode);
  if (!rootView) throw new Error("root symbol was not added");
  const rootRef = nodeRef(rootNode) ?? args.symbol!;
  bundles.set(rootRef, rootBundle);

  const queue: Array<{ ref: string; id: string; depth: number }> = [
    { ref: rootRef, id: rootView.id, depth: 0 },
  ];
  const processed = new Set<string>();
  const queued = new Set<string>([rootView.id]);

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const item = queue[cursor]!;
    if (processed.has(item.id)) continue;
    processed.add(item.id);
    if (item.depth >= args.depth) continue;

    let bundle = bundles.get(item.ref);
    if (!bundle) {
      try {
        bundle = await source.symbol(args.project!, item.ref);
      } catch {
        // A broken/missing connection should not kill the whole frame.
        continue;
      }
      bundles.set(item.ref, bundle);
    }

    const includeCallers = args.direction === "both" || args.direction === "callers";
    const includeCallees = args.direction === "both" || args.direction === "callees";

    if (includeCallers) {
      for (const connection of bundle.callers) {
        const neighbor = addNode(connectionToSymbolNode(connection));
        if (!neighbor) break;
        addEdge(neighbor.id, item.id, connection.type || "CALLS");
        const ref = nodeRef(connectionToSymbolNode(connection));
        if (ref && !queued.has(neighbor.id)) {
          queued.add(neighbor.id);
          queue.push({ ref, id: neighbor.id, depth: item.depth + 1 });
        }
      }
    }
    if (includeCallees) {
      for (const connection of bundle.callees) {
        const neighbor = addNode(connectionToSymbolNode(connection));
        if (!neighbor) break;
        addEdge(item.id, neighbor.id, connection.type || "CALLS");
        const ref = nodeRef(connectionToSymbolNode(connection));
        if (ref && !queued.has(neighbor.id)) {
          queued.add(neighbor.id);
          queue.push({ ref, id: neighbor.id, depth: item.depth + 1 });
        }
      }
    }
  }

  return {
    root: rootView.id,
    nodes: ordered,
    edges: edgeList,
    truncated: capHit,
  };
}

async function main(): Promise<void> {
  let args: CliArgs | null;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`render: ${error instanceof Error ? error.message : String(error)}`);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (!args) {
    console.log(USAGE);
    return;
  }

  const view = args.graph ? loadView(args.graph) : await fetchCbmView(args);
  const frameOptions: BuildFrameOptions = {};
  if (args.layoutDirection) frameOptions.direction = args.layoutDirection;
  if (args.spacing !== undefined) frameOptions.spacing = args.spacing;
  if (args.maxNodeWidth !== undefined) frameOptions.maxNodeWidth = args.maxNodeWidth;

  const frame = await buildFrame(view, frameOptions);

  let runCount = 0;
  let coloredRuns = 0;
  let boldRuns = 0;
  let nonEmptyLines = 0;
  for (const line of frame.lines) {
    if (line.length > 0) nonEmptyLines++;
    for (const run of line) {
      runCount++;
      if (run.fg) coloredRuns++;
      if (run.bold) boldRuns++;
      if (run.t.includes("\u001b")) throw new Error("frame still contains ANSI");
    }
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(frame) + "\n");

  console.log(
    `wrote ${args.out}: ${frame.width}x${frame.height}, ` +
      `${frame.nodeCount} nodes, ${frame.nodes.length} boxes, ` +
      `${frame.lines.length} lines (${nonEmptyLines} non-empty), ` +
      `${runCount} runs (${coloredRuns} colored, ${boldRuns} bold), ` +
      `${Object.keys(frame.meta).length} meta entries, truncated=${view.truncated}`,
  );
}

await main();
