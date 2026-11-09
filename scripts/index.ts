#!/usr/bin/env bun
/**
 * Build the cbm projects consumed by the graph UI.
 *
 * cbm-native:
 *   bun run index --backend cbm
 *
 * SCIP (scip-typescript -> scip-cbm-writer -> cbm SQLite):
 *   bun run index --backend scip
 *
 * Both:
 *   bun run index --backend both
 *
 * The default project name is the workspace basename; SCIP gets a "-scip"
 * suffix so the two graphs stay separate. This script only orchestrates the
 * external tools; it does not change code-graph.config.jsonc.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type IndexBackend = "cbm" | "scip" | "both";
export type IndexMode = "fast" | "moderate" | "full";

export interface IndexOptions {
  backend: IndexBackend;
  root: string;
  project: string;
  scipProject: string;
  mode: IndexMode;
  cbmBin: string;
  bunBin: string;
  nodeBin: string;
  scipIndexer: string;
  writerDir: string;
  scipOutput?: string;
  cacheDir?: string;
}

export const USAGE = `Usage: bun run index [options]

Build cbm-native and/or SCIP projects for this workspace.

Options:
  --backend <cbm|scip|both>   backend to build (default: cbm)
  --root <dir>                workspace root (default: cwd)
  --project <name>            cbm-native project (default: basename of root)
  --scip-project <name>       SCIP project (default: <project>-scip)
  --mode <fast|moderate|full> cbm-native indexing mode (default: moderate)
  --scip-indexer <path>       scip-typescript entry (default: ../../scip-typescript/dist/src/main.js)
  --writer <dir>              scip-cbm-writer directory (default: ../tools/scip-cbm-writer)
  --scip-output <path>        keep the generated .scip at this path
  --cache-dir <dir>           shared cbm cache (default: cbm's cache)
  --cbm-bin <path>            codebase-memory-mcp binary (default: CBM_BIN or PATH)
  --bun <path>                bun binary (default: BUN or PATH)
  --node <path>               node binary (default: NODE_BIN or PATH)
  -h, --help                  show this help

Examples:
  bun run index --backend cbm
  bun run index --backend scip --project graph-ui-svelte
  bun run index --backend both --mode fast`;

export function parseIndexArgs(argv: string[]): IndexOptions | "help" {
  const { values } = parseArgs({
    args: argv,
    options: {
      backend: { type: "string", default: "cbm" },
      root: { type: "string" },
      project: { type: "string" },
      "scip-project": { type: "string" },
      mode: { type: "string", default: "moderate" },
      "scip-indexer": { type: "string" },
      writer: { type: "string" },
      "scip-output": { type: "string" },
      "cache-dir": { type: "string" },
      "cbm-bin": { type: "string" },
      bun: { type: "string" },
      node: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) return "help";

  const backend = values.backend;
  if (backend !== "cbm" && backend !== "scip" && backend !== "both") {
    throw new Error(`--backend must be cbm, scip or both (got ${JSON.stringify(backend)})`);
  }

  const mode = values.mode;
  if (mode !== "fast" && mode !== "moderate" && mode !== "full") {
    throw new Error(`--mode must be fast, moderate or full (got ${JSON.stringify(mode)})`);
  }

  const root = resolve(values.root ?? process.cwd());
  if (!existsSync(root)) throw new Error(`workspace root does not exist: ${root}`);

  const project = values.project ?? basename(root);
  if (!project) throw new Error("cannot derive a project name from the workspace root; pass --project");

  const scipProject = values["scip-project"] ?? `${project}-scip`;
  const scipIndexer = resolve(
    values["scip-indexer"] ??
      process.env.SCIP_INDEXER ??
      join(root, "../../scip-typescript/dist/src/main.js"),
  );
  const writerDir = resolve(values.writer ?? join(root, "../tools/scip-cbm-writer"));

  return {
    backend,
    root,
    project,
    scipProject,
    mode,
    cbmBin: values["cbm-bin"] ?? process.env.CBM_BIN ?? "codebase-memory-mcp",
    bunBin: values.bun ?? process.env.BUN ?? "bun",
    nodeBin: values.node ?? process.env.NODE_BIN ?? "node",
    scipIndexer,
    writerDir,
    scipOutput: values["scip-output"] ? resolve(values["scip-output"]) : undefined,
    cacheDir: values["cache-dir"] ? resolve(values["cache-dir"]) : undefined,
  };
}

interface Command {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

function run(command: Command): boolean {
  console.log(`+ ${[command.command, ...command.args].join(" ")}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    stdio: "inherit",
    env: { ...process.env, ...command.env },
  });
  if (result.error) {
    console.error(`index: ${command.command}: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function cbmCommand(options: IndexOptions): Command {
  return {
    command: options.cbmBin,
    args: [
      "cli",
      "index_repository",
      "--repo-path",
      options.root,
      "--name",
      options.project,
      "--mode",
      options.mode,
    ],
    env: options.cacheDir ? { CBM_CACHE_DIR: options.cacheDir } : undefined,
  };
}

function scipCommands(options: IndexOptions, scipPath: string): Command[] {
  if (!existsSync(options.scipIndexer)) {
    throw new Error(
      `scip-typescript entry not found: ${options.scipIndexer}\n` +
        "  pass --scip-indexer <path/to/dist/src/main.js>",
    );
  }
  if (!existsSync(options.writerDir)) {
    throw new Error(
      `scip-cbm-writer directory not found: ${options.writerDir}\n` +
        "  pass --writer <path/to/tools/scip-cbm-writer>",
    );
  }

  const writerArgs = [
    "run",
    "src/cli.ts",
    scipPath,
    "--project",
    options.scipProject,
    "--root",
    options.root,
  ];
  if (options.cacheDir) writerArgs.push("--cache-dir", options.cacheDir);

  return [
    {
      command: options.nodeBin,
      args: [
        options.scipIndexer,
        "index",
        "--cwd",
        options.root,
        "--output",
        scipPath,
        "--no-progress-bar",
      ],
    },
    {
      command: options.bunBin,
      args: writerArgs,
      cwd: options.writerDir,
      env: options.cacheDir ? { CBM_CACHE_DIR: options.cacheDir } : undefined,
    },
  ];
}

function printConfig(options: IndexOptions): void {
  const backends: string[] = [];
  if (options.backend !== "scip") {
    backends.push(`    "cbm": { "project": ${JSON.stringify(options.project)} }`);
  }
  if (options.backend !== "cbm") {
    backends.push(`    "scip": { "project": ${JSON.stringify(options.scipProject)} }`);
  }

  console.log("\nAdd this to code-graph.config.jsonc:");
  console.log("{\n  \"backends\": {");
  console.log(backends.join(",\n"));
  console.log("  }\n}");
}

export function runIndex(options: IndexOptions): number {
  if (options.backend !== "scip" && !run(cbmCommand(options))) return 1;

  if (options.backend !== "cbm") {
    const temporary = options.scipOutput ? undefined : mkdtempSync(join(tmpdir(), "code-graph-scip-"));
    const scipPath = options.scipOutput ?? join(temporary!, `${options.scipProject}.scip`);

    let complete = false;
    try {
      for (const command of scipCommands(options, scipPath)) {
        if (!run(command)) {
          console.error(`index: kept ${scipPath} for debugging`);
          return 1;
        }
      }
      complete = true;
    } finally {
      if (temporary && complete) rmSync(temporary, { recursive: true, force: true });
    }
  }

  printConfig(options);
  return 0;
}

function main(argv: string[]): number {
  let options: IndexOptions | "help";
  try {
    options = parseIndexArgs(argv);
  } catch (error) {
    console.error(`index: ${error instanceof Error ? error.message : String(error)}`);
    console.error(USAGE);
    return 2;
  }

  if (options === "help") {
    console.log(USAGE);
    return 0;
  }

  try {
    return runIndex(options);
  } catch (error) {
    console.error(`index: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
