import { Args, Command, Flags } from "@oclif/core";

import { printCompletion } from "../completion.ts";
import {
  COMPLETION_SHELLS,
  detectShell,
  installCompletion,
  uninstallCompletion,
  type CompletionShell,
} from "../lib/completion-install.ts";

export default class CompletionCommand extends Command {
  static summary = "Print or install shell completion";
  static description =
    "Print a completion script for zsh, bash, fish or powershell, or install/remove a marked block in the detected shell profile. The internal completion protocol is `code-graph complete -- ...`.";
  static args = {
    action: Args.string({
      description: "shell, install, or uninstall",
      required: false,
    }),
    shell: Args.string({
      description: "shell for install/uninstall",
      required: false,
    }),
  };
  static flags = {
    "dry-run": Flags.boolean({ description: "show the change without writing" }),
  };
  static examples = [
    "<%= config.bin %> completion zsh",
    "<%= config.bin %> completion install",
    "<%= config.bin %> completion install powershell",
    "<%= config.bin %> completion uninstall",
  ];

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CompletionCommand);
    const action = args.action;
    if (!action) {
      this.error("expected a shell, install, or uninstall");
    }
    if (action === "install" || action === "uninstall") {
      const shell = (args.shell as CompletionShell | undefined) ?? detectShell();
      if (!shell) {
        this.error(
          "cannot detect $SHELL; pass one of: " + COMPLETION_SHELLS.join(", "),
        );
      }
      if (!COMPLETION_SHELLS.includes(shell)) {
        this.error(`unsupported shell: ${shell}`);
      }
      const result =
        action === "install"
          ? installCompletion({ shell, dryRun: flags["dry-run"] })
          : uninstallCompletion({ shell, dryRun: flags["dry-run"] });
      const verb = result.changed
        ? flags["dry-run"]
          ? "Would update"
          : "Updated"
        : "No change to";
      this.log(`${verb} ${result.path}`);
      if (flags["dry-run"] && result.changed) this.log(result.block);
      return;
    }

    if (!COMPLETION_SHELLS.includes(action as CompletionShell)) {
      this.error(`unsupported shell: ${action}`);
    }
    printCompletion(action);
  }
}
