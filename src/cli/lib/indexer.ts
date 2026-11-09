import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export type IndexBackend = "cbm" | "scip" | "both";
export type IndexMode = "fast" | "moderate" | "full";

export interface IndexOptions {
  backend: IndexBackend;
  root: string;
  project?: string;
  scipProject?: string;
  mode?: IndexMode;
  cbmBin?: string;
  bunBin?: string;
  nodeBin?: string;
  scipIndexer?: string;
  writerDir?: string;
  scipOutput?: string;
  cacheDir?: string;
}

interface ResolvedIndexOptions extends Required<Omit<IndexOptions, "project" | "scipProject" | "scipOutput" | "cacheDir">> {
  project: string;
  scipProject: string;
  scipOutput?: string;
  cacheDir?: string;
}

interface Command {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export function resolveIndexOptions(options: IndexOptions): ResolvedIndexOptions {
  const project = options.project ?? basename(options.root);
  return {
    backend: options.backend,
    root: options.root,
    project,
    scipProject: options.scipProject ?? `${project}-scip`,
    mode: options.mode ?? "moderate",
    cbmBin: options.cbmBin ?? process.env.CBM_BIN ?? "codebase-memory-mcp",
    bunBin: options.bunBin ?? process.env.BUN ?? "bun",
    nodeBin: options.nodeBin ?? process.env.NODE_BIN ?? "node",
    scipIndexer: options.scipIndexer ?? process.env.SCIP_INDEXER ?? join(options.root, "../../scip-typescript/dist/src/main.js"),
    writerDir: options.writerDir ?? join(options.root, "../tools/scip-cbm-writer"),
    scipOutput: options.scipOutput,
    cacheDir: options.cacheDir,
  };
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

function cbmCommand(options: ResolvedIndexOptions): Command {
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

function scipCommands(options: ResolvedIndexOptions, scipPath: string): Command[] {
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

function printConfig(options: ResolvedIndexOptions): void {
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

/** Index one workspace. Returns a process exit code. */
export function runIndex(input: IndexOptions): number {
  const options = resolveIndexOptions(input);

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
