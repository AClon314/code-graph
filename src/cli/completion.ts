/**
 * Shell completion via @bomb.sh/tab.
 *
 * The generated scripts call `code-graph complete -- <words>`. We answer
 * before Oclif sees the args, so Oclif remains the real parser. Dynamic root
 * completion is intentionally synchronous: read roots.json, never hit cbm.
 */
import tab from "@bomb.sh/tab";
import { basename } from "node:path";

import { readRootsCache } from "./lib/roots-cache.ts";

const cli = tab;

const entries = cli.command("entries", "List project root symbols");
addProjectOptions(entries);
entries.options.delete("symbol-entry");
entries.option("cbm", "Explicit local cbm base URL");
entries.option("limit", "Maximum candidates", choice(["10", "25", "50", "100"]));
entries.option("json", "Print JSON", noValues);
entries.option("write-cache", "Write roots.json", noValues);

const graph = cli.command("graph", "One-click index + render");
addProjectOptions(graph);
addRenderOptions(graph);
addIndexOptions(graph);

const index = cli.command("index", "Build an index");
addProjectOptions(index);
index.options.delete("symbol-entry");
index.option("backend", "Graph backend", choice(["cbm", "scip", "both"]));
addIndexOptions(index);

const render = cli.command("render", "Render an existing graph");
addProjectOptions(render);
addRenderOptions(render);

const completion = cli.command("completion", "Print a shell completion script");
completion.argument("shell", (complete) => {
  for (const shell of ["zsh", "bash", "fish", "powershell"]) {
    complete(shell, "");
  }
});

/** Print a completion script; also used by the visible `completion` command. */
export function printCompletion(shell: string): void {
  if (!["zsh", "bash", "fish", "powershell"].includes(shell)) {
    throw new Error(`unsupported shell: ${shell}`);
  }
  tab.setup("code-graph", "code-graph", shell);
}

/** Handle `code-graph complete ...` before Oclif parses the command. */
export function handleCompletion(argv: string[] = process.argv.slice(2)): number {
  const shell = argv[1];
  if (shell === "--") {
    tab.parse(argv.slice(2));
    return 0;
  }
  if (shell === undefined) {
    console.error("completion: expected a shell (zsh, bash, fish, powershell)");
    return 2;
  }
  printCompletion(shell);
  return 0;
}

function addProjectOptions(command: ReturnType<typeof cli.command>): void {
  command.option("backend", "Graph backend", choice(["cbm", "scip"]));
  command.option("root", "Workspace root");
  command.option("project", "cbm/scip project name", projectValues);
  command.option("scip-project", "SCIP project name", projectValues);
  command.option("symbol-entry", "Root symbol (qn or #id)", rootValues);
}

function addRenderOptions(command: ReturnType<typeof cli.command>): void {
  command.option("graph", "GraphViewData fixture");
  command.option("depth", "BFS depth", choice(["1", "2", "3"]));
  command.option("direction", "BFS direction", choice(["both", "callers", "callees"]));
  command.option("format", "Output format", choice(["svg", "orchgraph", "both"]));
  command.option("out", "Output base path");
  command.option("layout-direction", "Layout direction", choice(["DOWN", "UP", "LEFT", "RIGHT"]));
  command.option("spacing", "orchgraph spacing");
  command.option("max-node-width", "orchgraph node width");
  command.option("max-nodes", "Maximum graph nodes");
  command.option("cbm", "Explicit local cbm base URL");
}

function addIndexOptions(command: ReturnType<typeof cli.command>): void {
  command.option("mode", "cbm index mode", choice(["fast", "moderate", "full"]));
  command.option("cbm-bin", "codebase-memory-mcp binary");
  command.option("bun", "Bun binary");
  command.option("node", "Node binary");
  command.option("scip-indexer", "scip-typescript entry point");
  command.option("writer", "scip-cbm-writer directory");
  command.option("scip-output", "Keep the .scip file");
  command.option("cache-dir", "cbm cache directory");
}

function choice(values: string[]) {
  return (complete: (value: string, description: string) => void): void => {
    for (const value of values) complete(value, "");
  };
}

function noValues(complete: (value: string, description: string) => void): void {
  // Boolean flags: let the shell stop offering values after this flag.
  void complete;
}

function projectValues(complete: (value: string, description: string) => void): void {
  const root = optionValue("root") ?? process.cwd();
  const cache = readRootsCache(root);
  const projects = Object.entries(cache.projects);
  for (const [project, entry] of projects) {
    complete(project, `${entry.roots.length} roots`);
  }
  if (projects.length === 0) complete(basename(root), "workspace default");
}

function rootValues(complete: (value: string, description: string) => void): void {
  const root = optionValue("root") ?? process.cwd();
  const cache = readRootsCache(root);
  const requested = optionValue("project");
  const project =
    requested ??
    Object.keys(cache.projects)[0] ??
    basename(root);
  for (const candidate of cache.projects[project]?.roots ?? []) {
    complete(candidate.qualifiedName, candidate.reason || candidate.label);
  }
}

/** Read a flag from the raw completion request (tab callbacks get no values). */
function optionValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const long = `--${name}`;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === long) return argv[index + 1];
    if (item.startsWith(`${long}=`)) return item.slice(long.length + 1);
  }
  return undefined;
}
