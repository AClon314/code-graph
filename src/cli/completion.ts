/**
 * Shell completion via @bomb.sh/tab's Commander adapter.
 *
 * Commander owns command/flag parsing; the adapter derives the completion
 * tree from the same definitions and installs the visible `completion` command
 * plus the hidden `complete -- ...` protocol.
 */
import tab from "@bomb.sh/tab/commander";
import type { Command } from "commander";
import { basename } from "node:path";

import { readRootsCache } from "./lib/roots-cache.ts";
import {
  COMPLETION_SHELLS,
  detectShell,
  installCompletion,
  uninstallCompletion,
  type CompletionShell,
} from "./lib/completion-install.ts";

export function attachCompletion(program: Command): void {
  const completion = tab(program, { completionCommandName: "completion" });
  const command = program.commands.find((item) => item.name() === "completion");
  if (command) {
    command.description("Print or install shell completion");
    addManagement(command);
  }

  for (const name of ["graph", "index", "render", "entries"]) {
    const current = completion.commands.get(name);
    if (!current) continue;
    const project = current.options.get("project");
    if (project) project.handler = projectValues;
    const symbol = current.options.get("symbol-entry");
    if (symbol) symbol.handler = rootValues;
  }
}

function addManagement(command: Command): void {
  command
    .command("install")
    .description("install a marked completion block in the detected shell profile")
    .argument("[shell]", "zsh, bash, fish or powershell")
    .option("--dry-run", "show the block without writing")
    .action((shell: string | undefined, options: { dryRun?: boolean }) => {
      const result = installCompletion({
        shell: completionShell(shell),
        dryRun: options.dryRun,
      });
      const verb = result.changed
        ? options.dryRun
          ? "Would update"
          : "Updated"
        : "No change to";
      console.log(`${verb} ${result.path}`);
      if (options.dryRun && result.changed) console.log(result.block);
    });

  command
    .command("uninstall")
    .description("remove only the marked code-graph completion block")
    .argument("[shell]", "zsh, bash, fish or powershell")
    .option("--dry-run", "show the change without writing")
    .action((shell: string | undefined, options: { dryRun?: boolean }) => {
      const result = uninstallCompletion({
        shell: completionShell(shell),
        dryRun: options.dryRun,
      });
      console.log(
        (result.changed ? (options.dryRun ? "Would update " : "Updated ") : "No change to ") +
          result.path,
      );
    });

}

function completionShell(value: string | undefined): CompletionShell {
  const shell = (value as CompletionShell | undefined) ?? detectShell();
  if (!shell) {
    throw new Error(
      "cannot detect $SHELL; pass one of: " + COMPLETION_SHELLS.join(", "),
    );
  }
  if (!COMPLETION_SHELLS.includes(shell)) {
    throw new Error(`unsupported shell: ${shell}`);
  }
  return shell;
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
    requested ?? Object.keys(cache.projects)[0] ?? basename(root);
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
