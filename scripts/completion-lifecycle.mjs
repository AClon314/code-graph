#!/usr/bin/env node
/**
 * npm lifecycle helper:
 *   --notice     print an opt-in completion hint during install
 *   --uninstall  remove only the managed code-graph completion block
 *
 * It never runs during CI/with CODE_GRAPH_SKIP_COMPLETION_NOTICE=1. The
 * uninstall path is intentionally independent from the freshly removed binary
 * and only touches the marked block.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const START = "# >>> code-graph completion >>>";
const END = "# <<< code-graph completion <<<";

const args = process.argv.slice(2);
if (process.env.CI && args.includes("--notice")) process.exit(0);
if (process.env.CODE_GRAPH_SKIP_COMPLETION_NOTICE === "1" && args.includes("--notice")) process.exit(0);

function detectShell() {
  const raw = process.env.SHELL?.trim() || "";
  const name = raw.split(/[\\/]/).pop()?.toLowerCase() || "";
  if (name.includes("zsh")) return "zsh";
  if (name.includes("bash")) return "bash";
  if (name.includes("fish")) return "fish";
  if (name.includes("pwsh") || name.includes("powershell")) return "powershell";
  if (process.env.PSModulePath || process.env.POWERSHELL_DISTRIBUTION_CHANNEL) return "powershell";
  return null;
}

function profilePath(shell) {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (shell === "zsh") return `${process.env.ZDOTDIR || home}/.zshrc`;
  if (shell === "bash") return `${home}/.bashrc`;
  if (shell === "fish") return `${process.env.XDG_CONFIG_HOME || `${home}/.config`}/fish/config.fish`;
  return process.env.CODE_GRAPH_POWERSHELL_PROFILE || `${home}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`;
}

function uninstall() {
  const shell = detectShell();
  if (!shell) return;
  const path = profilePath(shell);
  if (!existsSync(path)) return;
  const current = readFileSync(path, "utf8");
  const start = current.indexOf(START);
  const end = start < 0 ? -1 : current.indexOf(END, start);
  if (start < 0 || end < 0) return;
  const before = current.slice(0, start).replace(/\n+$/, "");
  const after = current.slice(end + END.length).replace(/^\n+/, "");
  const next = [before, after].filter(Boolean).join("\n");
  writeFileSync(path, next.length > 0 ? `${next}\n` : "");
  console.log(`[code-graph] removed shell completion from ${path}`);
}

try {
  if (args.includes("--uninstall")) {
    uninstall();
  } else if (args.includes("--notice")) {
  const shell = detectShell();
  if (shell) {
    const path = profilePath(shell);
    if (existsSync(path)) {
      const text = readFileSync(path, "utf8");
      const manual = new RegExp(`code-graph\\s+(?:completion|complete)\\s+${shell}`, "i");
      if (text.includes(START) || manual.test(text)) process.exit(0);
    }
  }
    const hint = shell ? `code-graph completion install ${shell}` : "code-graph completion install <shell>";
    console.log(`[code-graph] shell completion is not installed. Run: ${hint}`);
  }
} catch (error) {
  // Lifecycle scripts must never make install/uninstall fail.
  console.error(`[code-graph] completion lifecycle skipped: ${String(error)}`);
}
