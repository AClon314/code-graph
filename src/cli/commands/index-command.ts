import { Command } from "@oclif/core";
import { resolve } from "node:path";

import { indexFlags } from "../lib/flags.ts";
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
  static flags = { ...indexFlags };

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
