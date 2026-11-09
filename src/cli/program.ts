import { Command, Option } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { attachCompletion } from "./completion.ts";
import { runIndex } from "./lib/indexer.ts";
import { renderResolved, resolveOutputMode } from "./lib/output.ts";
import { resolveProject } from "./lib/project.ts";
import { writeRootsCache, refreshRootsCache } from "./lib/roots-cache.ts";
import { formatRoots, loadProjectRoots } from "../lib/graph/roots-fetch.ts";

/** Build the Commander program and attach @bomb.sh/tab completion. */
export function createProgram(): Command {
  const program = new Command("code-graph");
  program
    .description("Call graph and code navigation backed by codebase-memory-mcp.")
    .version(packageVersion());

  addIndexCommand(program);
  addGraphCommand(program);
  addRenderCommand(program);
  addEntriesCommand(program);
  attachCompletion(program);
  return program;
}

function choice(
  flags: string,
  description: string,
  values: string[],
  defaultValue?: string,
): Option {
  const option = new Option(flags, description).choices(values);
  if (defaultValue !== undefined) option.default(defaultValue);
  return option;
}

function addIndexCommand(program: Command): void {
  const command = program
    .command("index")
    .description("Build a cbm-native or SCIP index for the workspace")
    .addOption(choice("-b, --backend <backend>", "index backend", ["cbm", "scip", "both"], "cbm"))
    .option("--root <path>", "workspace root", process.cwd())
    .option("--project <name>", "cbm-native project name")
    .option("--scip-project <name>", "SCIP project name")
    .addOption(choice("--mode <mode>", "cbm-native indexing mode", ["fast", "moderate", "full"], "moderate"))
    .option("--scip-indexer <path>", "scip-typescript entry point")
    .option("--writer <path>", "scip-cbm-writer directory")
    .option("--scip-output <path>", "keep the generated .scip at this path")
    .option("--cache-dir <path>", "shared cbm cache directory")
    .option("--cbm-bin <path>", "codebase-memory-mcp binary")
    .option("--bun <path>", "bun binary used for scip-cbm-writer")
    .option("--node <path>", "node binary used by scip-typescript");
  command.action(async (options) => {
    const root = resolve(options.root);
    const cbm = await resolveProject(root, "cbm", options.project);
    const scip = await resolveProject(root, "scip", options.scipProject);
    const code = runIndex({
      backend: options.backend,
      root,
      project: cbm.project,
      scipProject: scip.project,
      mode: options.mode,
      cbmBin: options.cbmBin,
      bunBin: options.bun,
      nodeBin: options.node,
      scipIndexer: options.scipIndexer,
      writerDir: options.writer,
      scipOutput: options.scipOutput,
      cacheDir: options.cacheDir,
    });
    if (code !== 0) process.exit(code);
    await refreshRoots(root, projectsFor(options.backend, cbm.project, scip.project), options.cbm);
  });
}

function addGraphCommand(program: Command): void {
  const command = program
    .command("graph")
    .description("Index the workspace (unless --graph is supplied), then render the graph")
    .addOption(choice("-b, --backend <backend>", "graph backend", ["cbm", "scip"], "cbm"))
    .option("--root <path>", "workspace root", process.cwd())
    .option("--project <name>", "cbm-native project name")
    .option("--scip-project <name>", "SCIP project name")
    .option("--cbm <url>", "explicit local cbm base URL")
    .option("--symbol-entry <qn>", "root symbol (qn or #id)")
    .option("--graph <path>", "GraphViewData JSON fixture")
    .option("--depth <n>", "BFS depth (1-3)", integer, 2)
    .addOption(choice("--direction <direction>", "BFS direction", ["both", "callers", "callees"], "both"))
    .option("--max-nodes <n>", "maximum graph nodes", integer, 60)
    .addOption(choice("--format <format>", "output format (default: both on TTY, orchgraph when piped)", ["svg", "orchgraph", "both"]))
    .option("--out <path>", "output base path (default: code-graph.<project>)")
    .addOption(choice("--layout-direction <direction>", "layout direction", ["DOWN", "UP", "LEFT", "RIGHT"], "DOWN"))
    .option("--spacing <n>", "orchgraph spacing", integer, 3)
    .option("--max-node-width <n>", "orchgraph node width in cells", integer, 32)
    .addOption(choice("--mode <mode>", "cbm-native indexing mode", ["fast", "moderate", "full"], "moderate"))
    .option("--scip-indexer <path>", "scip-typescript entry point")
    .option("--writer <path>", "scip-cbm-writer directory")
    .option("--scip-output <path>", "keep the generated .scip at this path")
    .option("--cache-dir <path>", "shared cbm cache directory")
    .option("--cbm-bin <path>", "codebase-memory-mcp binary")
    .option("--bun <path>", "bun binary used for scip-cbm-writer")
    .option("--node <path>", "node binary used by scip-typescript");
  command.action(async (options) => {
    const root = resolve(options.root);
    const cbm = await resolveProject(root, "cbm", options.project);
    const scip = await resolveProject(root, "scip", options.scipProject);

    if (!options.graph) {
      const code = runIndex({
        backend: options.backend,
        root,
        project: cbm.project,
        scipProject: scip.project,
        mode: options.mode,
        cbmBin: options.cbmBin,
        bunBin: options.bun,
        nodeBin: options.node,
        scipIndexer: options.scipIndexer,
        writerDir: options.writer,
        scipOutput: options.scipOutput,
        cacheDir: options.cacheDir,
      });
      if (code !== 0) process.exit(code);
      await refreshRoots(
        root,
        projectsFor(options.backend, cbm.project, scip.project),
        options.cbm,
      );
    }
    await renderAndReport({
      root,
      backend: options.backend,
      project: cbm.project,
      scipProject: scip.project,
      cbm: options.cbm,
      symbolEntry: options.symbolEntry,
      graph: options.graph,
      depth: options.depth,
      direction: options.direction,
      maxNodes: options.maxNodes,
      format: resolveOutputMode(options.format),
      out: options.out,
      layoutDirection: options.layoutDirection,
      spacing: options.spacing,
      maxNodeWidth: options.maxNodeWidth,
    });
  });
}

function addRenderCommand(program: Command): void {
  const command = program
    .command("render")
    .description("Render an existing graph to SVG and/or orchgraph text")
    .addOption(choice("-b, --backend <backend>", "graph backend", ["cbm", "scip"], "cbm"))
    .option("--root <path>", "workspace root", process.cwd())
    .option("--project <name>", "cbm-native project name")
    .option("--scip-project <name>", "SCIP project name")
    .option("--cbm <url>", "explicit local cbm base URL")
    .option("--symbol-entry <qn>", "root symbol (qn or #id)")
    .option("--graph <path>", "GraphViewData JSON fixture")
    .option("--depth <n>", "BFS depth (1-3)", integer, 2)
    .addOption(choice("--direction <direction>", "BFS direction", ["both", "callers", "callees"], "both"))
    .option("--max-nodes <n>", "maximum graph nodes", integer, 60)
    .addOption(choice("--format <format>", "output format (default: both on TTY, orchgraph when piped)", ["svg", "orchgraph", "both"]))
    .option("--out <path>", "output base path (default: code-graph.<project>)")
    .addOption(choice("--layout-direction <direction>", "layout direction", ["DOWN", "UP", "LEFT", "RIGHT"], "DOWN"))
    .option("--spacing <n>", "orchgraph spacing", integer, 3)
    .option("--max-node-width <n>", "orchgraph node width in cells", integer, 32);
  command.action(async (options) => {
    await renderAndReport({
      root: resolve(options.root),
      backend: options.backend,
      project: options.project,
      scipProject: options.scipProject,
      cbm: options.cbm,
      symbolEntry: options.symbolEntry,
      graph: options.graph,
      depth: options.depth,
      direction: options.direction,
      maxNodes: options.maxNodes,
      format: resolveOutputMode(options.format),
      out: options.out,
      layoutDirection: options.layoutDirection,
      spacing: options.spacing,
      maxNodeWidth: options.maxNodeWidth,
    });
  });
}

function addEntriesCommand(program: Command): void {
  const command = program
    .command("entries")
    .description("List project root symbols for entry pickers/completion")
    .addOption(choice("-b, --backend <backend>", "graph backend", ["cbm", "scip"], "cbm"))
    .option("--root <path>", "workspace root", process.cwd())
    .option("--project <name>", "cbm-native project name")
    .option("--cbm <url>", "explicit local cbm base URL")
    .option("--limit <n>", "maximum candidates", integer, 50)
    .option("--json", "print JSON")
    .option("--write-cache", "write .codebase-memory/code-graph/roots.json");
  command.action(async (options) => {
    const root = resolve(options.root);
    const project = await resolveProject(root, options.backend, options.project);
    const candidates = await loadProjectRoots(project.project, {
      cbm: options.cbm,
      limit: options.limit,
    });
    if (options.writeCache) {
      const path = writeRootsCache(root, project.project, candidates);
      if (!options.json) console.error(`Wrote ${path}`);
    }
    if (options.json) {
      console.log(JSON.stringify(candidates, null, 2));
      return;
    }
    console.log(formatRoots(candidates));
  });
}

interface RenderInput {
  root: string;
  backend: "cbm" | "scip";
  project?: string;
  scipProject?: string;
  cbm?: string;
  symbolEntry?: string;
  graph?: string;
  depth: number;
  direction: "both" | "callers" | "callees";
  maxNodes: number;
  format: { format: "svg" | "orchgraph" | "both"; stream: boolean };
  out?: string;
  layoutDirection: "DOWN" | "UP" | "LEFT" | "RIGHT";
  spacing: number;
  maxNodeWidth: number;
}

async function renderAndReport(input: RenderInput): Promise<void> {
  if (input.format.stream && input.out) console.error("stdout is piped; ignoring --out");
  const result = await renderResolved({
    root: input.root,
    backend: input.backend,
    project: input.project,
    scipProject: input.scipProject,
    cbm: input.cbm,
    symbolEntry: input.symbolEntry,
    graph: input.graph,
    depth: input.depth as 1 | 2 | 3,
    direction: input.direction,
    maxNodes: input.maxNodes,
    format: input.format.format,
    out: input.out,
    stream: input.format.stream,
    layoutDirection: input.layoutDirection,
    spacing: input.spacing,
    maxNodeWidth: input.maxNodeWidth,
  });
  console.error(
    `Rendered ${result.nodes} nodes / ${result.edges} edges` +
      (result.truncated ? " (truncated)" : ""),
  );
  if (result.stdout !== undefined) process.stdout.write(result.stdout);
  else for (const path of result.files) console.error(`Wrote ${path}`);
}

function projectsFor(backend: string, cbm: string, scip: string): string[] {
  return [
    ...(backend === "scip" ? [] : [cbm]),
    ...(backend === "cbm" ? [] : [scip]),
  ];
}

async function refreshRoots(root: string, projects: string[], cbm?: string): Promise<void> {
  for (const project of projects) {
    try {
      await refreshRootsCache({ root, project, cbm });
    } catch (cause) {
      console.error(`roots cache skipped for ${project}: ${String(cause)}`);
    }
  }
}

function integer(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`expected an integer, got ${value}`);
  return parsed;
}

function packageVersion(): string {
  try {
    const value = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return typeof value.version === "string" ? value.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
