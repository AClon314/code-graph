import { Command, Flags } from "@oclif/core";
import { resolve } from "node:path";

import { runIndex } from "../lib/indexer.ts";
import { resolveProject } from "../lib/project.ts";

export default class IndexCommand extends Command {
  static summary = "Build a cbm-native or SCIP index for the workspace";
  static description =
    "Create the cbm project consumed by the GUI/TUI. The SCIP path runs scip-typescript and the external scip-cbm-writer.";
  static examples = [
    "<%= config.bin %> index --backend cbm",
    "<%= config.bin %> index --backend scip --project my-project",
    "<%= config.bin %> index --backend both --mode fast",
  ];
  static flags = {
    backend: Flags.string({
      char: "b",
      options: ["cbm", "scip", "both"],
      default: "cbm",
      description: "index backend",
    }),
    root: Flags.string({
      description: "workspace root",
      default: process.cwd(),
    }),
    project: Flags.string({
      description: "cbm-native project name (default: workspace basename)",
    }),
    "scip-project": Flags.string({
      description: "SCIP project name (default: <project>-scip)",
    }),
    mode: Flags.string({
      options: ["fast", "moderate", "full"],
      default: "moderate",
      description: "cbm-native indexing mode",
    }),
    "scip-indexer": Flags.string({
      description: "scip-typescript entry point",
    }),
    writer: Flags.string({
      description: "scip-cbm-writer directory",
    }),
    "scip-output": Flags.string({
      description: "keep the generated .scip at this path",
    }),
    "cache-dir": Flags.string({
      description: "shared cbm cache directory",
    }),
    "cbm-bin": Flags.string({
      description: "codebase-memory-mcp binary",
    }),
    bun: Flags.string({
      description: "bun binary used for scip-cbm-writer",
    }),
    node: Flags.string({
      description: "node binary used for scip-typescript",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IndexCommand);
    const root = resolve(flags.root);
    const cbm = await resolveProject(root, "cbm", flags.project);
    const scip = await resolveProject(root, "scip", flags["scip-project"]);
    const code = runIndex({
      backend: flags.backend as "cbm" | "scip" | "both",
      root,
      project: cbm.project,
      scipProject: scip.project,
      mode: flags.mode as "fast" | "moderate" | "full",
      cbmBin: flags["cbm-bin"],
      bunBin: flags.bun,
      nodeBin: flags.node,
      scipIndexer: flags["scip-indexer"],
      writerDir: flags.writer,
      scipOutput: flags["scip-output"],
      cacheDir: flags["cache-dir"],
    });
    if (code !== 0) this.exit(code);
  }
}
