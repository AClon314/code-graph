#!/usr/bin/env bun
/**
 * Render a code graph into the JSON frame consumed by tui/plugin.ts.
 *
 * Fixture / already-built graph (deterministic tests):
 *
 *   bun run tui/render.ts --graph tui/fixture-graph.json --out /tmp/code-graph-frame.json
 *
 * Live cbm data (shared cbm neighborhood loader):
 *
 *   bun run tui/render.ts --project my-project \
 *     --symbol-entry 'pkg.mod.fn' --depth 2 --direction both --out /tmp/frame.json
 *
 * No src/ files are modified: this script only reads GraphViewData through the
 * shared graph loader and CbmHttpSource.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildFrame } from "./frame.ts";
import { resolveCbmBaseUrl } from "../src/lib/cbm-discovery.ts";
import type { BuildFrameOptions } from "./frame.ts";
import { CbmHttpSource } from "../src/lib/graph/cbm-http.ts";
import type { GraphDirection } from "orchgraph";
import { loadGraphView } from "../src/lib/graph/load.ts";
import type { NeighborhoodDepth } from "../src/lib/graph/neighborhood.ts";
import type { GraphViewData } from "../src/lib/graph/types.ts";

type BfsDirection = "both" | "callers" | "callees";

interface CliArgs {
  graph?: string;
  cbm?: string;
  project?: string;
  symbolEntry?: string;
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
  bun run tui/render.ts --project <name> --symbol-entry <qn> --out <frame.json> [options]

options:
  --cbm <url>             explicit local cbm base (testing only)
  --depth <n>             BFS depth 0-3 (default 2)
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
    out: resolve(import.meta.dir, "../out/tui/frame.json"),
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
    } else if (flag === "--symbol-entry") {
      args.symbolEntry = takeValue(argv, i, flag);
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
  if (!args.graph && (!args.project || !args.symbolEntry)) {
    throw new Error("live render needs --project and --symbol-entry");
  }
  return args;
}

async function loadView(args: CliArgs): Promise<GraphViewData> {
  if (args.graph) return loadGraphView({ graph: args.graph });

  const endpoint = await resolveCbmBaseUrl(args.cbm);
  const source = new CbmHttpSource({
    baseUrl: endpoint.baseUrl,
    project: args.project!,
  });
  return loadGraphView({
    source,
    project: args.project!,
    symbolEntry: args.symbolEntry!,
    depth: Math.min(3, Math.max(0, args.depth)) as NeighborhoodDepth,
    direction: args.direction,
    maxNodes: args.maxNodes,
  });
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

  const view = await loadView(args);
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

  console.error(
    `wrote ${args.out}: ${frame.width}x${frame.height}, ` +
      `${frame.nodeCount} nodes, ${frame.nodes.length} boxes, ` +
      `${frame.lines.length} lines (${nonEmptyLines} non-empty), ` +
      `${runCount} runs (${coloredRuns} colored, ${boldRuns} bold), ` +
      `${Object.keys(frame.meta).length} meta entries, truncated=${view.truncated}`,
  );
}

await main();
