import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CompletionShell = "zsh" | "bash" | "fish" | "powershell";

export const COMPLETION_START = "# >>> code-graph completion >>>";
export const COMPLETION_END = "# <<< code-graph completion <<<";
export const COMPLETION_SHELLS: CompletionShell[] = [
  "zsh",
  "bash",
  "fish",
  "powershell",
];

export interface CompletionInstallOptions {
  shell?: CompletionShell;
  profile?: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
}

export interface CompletionInstallResult {
  shell: CompletionShell;
  path: string;
  changed: boolean;
  block: string;
}

/** Identify the interactive shell from $SHELL (PowerShell falls back to env). */
export function detectShell(
  env: NodeJS.ProcessEnv = process.env,
): CompletionShell | null {
  const raw = env.SHELL?.trim();
  if (raw) {
    const name = raw.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    if (name.includes("zsh")) return "zsh";
    if (name.includes("bash")) return "bash";
    if (name.includes("fish")) return "fish";
    if (name.includes("pwsh") || name.includes("powershell")) return "powershell";
  }
  if (env.PSModulePath || env.POWERSHELL_DISTRIBUTION_CHANNEL) return "powershell";
  return null;
}

/** The rc/profile file that owns the managed completion block. */
export function completionProfilePath(
  shell: CompletionShell,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  if (shell === "zsh") return join(env.ZDOTDIR || home, ".zshrc");
  if (shell === "bash") return join(home, ".bashrc");
  if (shell === "fish") {
    return join(env.XDG_CONFIG_HOME || join(home, ".config"), "fish", "config.fish");
  }
  return (
    env.CODE_GRAPH_POWERSHELL_PROFILE ||
    join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
  );
}

/** Shell-specific managed block; source the visible completion command. */
export function completionBlock(shell: CompletionShell): string {
  if (shell === "fish") {
    return `${COMPLETION_START}
if type -q code-graph
    code-graph completion fish | source
end
${COMPLETION_END}`;
  }
  if (shell === "powershell") {
    return `${COMPLETION_START}
if (Get-Command code-graph -ErrorAction SilentlyContinue) {
    code-graph completion powershell | Out-String | Invoke-Expression
}
${COMPLETION_END}`;
  }
  return `${COMPLETION_START}
if command -v code-graph >/dev/null 2>&1; then
  source <(code-graph completion ${shell})
fi
${COMPLETION_END}`;
}

/** Detect a pre-existing manual source/Invoke-Expression line. */
export function hasManualCompletion(
  text: string,
  shell: CompletionShell,
): boolean {
  return new RegExp(
    `code-graph\\s+(?:completion|complete)\\s+${shell}`,
    "i",
  ).test(text);
}

export function installCompletion(
  options: CompletionInstallOptions = {},
): CompletionInstallResult {
  const env = options.env ?? process.env;
  const shell = options.shell ?? detectShell(env);
  if (!shell) {
    throw new Error(
      "cannot detect $SHELL; pass one of: " + COMPLETION_SHELLS.join(", "),
    );
  }
  const path = options.profile ?? completionProfilePath(shell, env);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current.includes(COMPLETION_START) || hasManualCompletion(current, shell)) {
    return { shell, path, changed: false, block: completionBlock(shell) };
  }
  const block = completionBlock(shell);
  if (!options.dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
    writeFileSync(path, `${current}${prefix}${block}\n`);
  }
  return { shell, path, changed: true, block };
}

/** Remove only the managed block; user lines outside the markers are kept. */
export function uninstallCompletion(
  options: CompletionInstallOptions = {},
): CompletionInstallResult {
  const env = options.env ?? process.env;
  const shell = options.shell ?? detectShell(env);
  if (!shell) {
    throw new Error(
      "cannot detect $SHELL; pass one of: " + COMPLETION_SHELLS.join(", "),
    );
  }
  const path = options.profile ?? completionProfilePath(shell, env);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const start = current.indexOf(COMPLETION_START);
  const end = start < 0 ? -1 : current.indexOf(COMPLETION_END, start);
  if (start < 0 || end < 0) {
    return { shell, path, changed: false, block: completionBlock(shell) };
  }
  const before = current.slice(0, start).replace(/\n+$/, "");
  const after = current.slice(end + COMPLETION_END.length).replace(/^\n+/, "");
  const next = [before, after].filter(Boolean).join("\n");
  if (!options.dryRun) writeFileSync(path, next.length > 0 ? `${next}\n` : "");
  return { shell, path, changed: true, block: completionBlock(shell) };
}
