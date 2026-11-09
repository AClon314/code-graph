import { Args, Command } from "@oclif/core";

import { printCompletion } from "../completion.ts";

export default class CompletionCommand extends Command {
  static summary = "Print a shell completion script";
  static description =
    "Print a completion script for zsh, bash, fish or powershell. Install it manually; this command never edits your shell profile. The internal protocol is `code-graph complete -- ...`.";
  static args = {
    shell: Args.string({
      description: "zsh, bash, fish or powershell",
      required: true,
      options: ["zsh", "bash", "fish", "powershell"],
    }),
  };
  static examples = [
    "<%= config.bin %> completion zsh",
    "<%= config.bin %> completion powershell",
  ];

  async run(): Promise<void> {
    const { args } = await this.parse(CompletionCommand);
    printCompletion(args.shell);
  }
}
