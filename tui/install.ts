#!/usr/bin/env bun
/**
 * Build and install the Fresh plugin. This replaces the old shell installer so
 * the same command works on Linux, macOS and Windows.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const bundle = join(repo, "out", "fresh-plugin", "code-graph.js");
const staged = join(repo, "out", "fresh-plugin", "code-graph.ts");

function runBuild(): void {
  const result = execFileSync(process.execPath, ["run", "build:fresh"], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.trim()) process.stdout.write(result);
}

function freshConfigDir(): string {
  const explicit = process.env.FRESH_CONFIG;
  if (explicit) return resolve(explicit);

  // Ask Fresh itself first: this is the only reliable way to handle Windows,
  // macOS and XDG layouts without duplicating Fresh's directory rules.
  const fromCli = freshConfigFromCli();
  if (fromCli) return fromCli;

  const home = homedir();
  const candidates: string[] = [];
  if (process.env.XDG_CONFIG_HOME) candidates.push(join(process.env.XDG_CONFIG_HOME, "fresh"));
  if (platform() === "win32" && process.env.APPDATA) candidates.push(join(process.env.APPDATA, "fresh"));
  if (platform() === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, "fresh"));
  }
  candidates.push(join(home, ".config", "fresh"));

  const existing = candidates.find(
    (dir) => existsSync(join(dir, "plugins")) || existsSync(join(dir, "types")),
  );
  return existing ?? candidates[0]!;
}

function freshConfigFromCli(): string | null {
  const bin = process.env.FRESH_BIN || "fresh";
  try {
    const stdout = execFileSync(bin, ["--cmd", "config", "paths"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = stdout.match(/^\s*Config:\s*(.+?)\s*$/m);
    return match?.[1] ? resolve(match[1]) : null;
  } catch {
    return null;
  }
}

function preserveLegacyPlugin(plugins: string): void {
  for (const name of ["code-nav.ts", "code-graph.js"]) {
    const legacy = join(plugins, name);
    if (!existsSync(legacy)) continue;
    const backup = `${legacy}.bak`;
    if (existsSync(backup)) continue;
    renameSync(legacy, backup);
    console.log(`moved legacy plugin to ${backup}`);
  }
}

runBuild();
if (!existsSync(bundle)) {
  console.error(`error: build did not create ${bundle}`);
  process.exit(1);
}

// Fresh loads .ts plugins. Prefix the bundle with the machine-specific paths so
// the same checked-in source works on Unix and Windows.
const wrapper =
  `globalThis.CODE_NAV_REPO = ${JSON.stringify(repo)};\n` +
  `globalThis.CODE_NAV_BUN = ${JSON.stringify(process.execPath)};\n` +
  `globalThis.CODE_NAV_JUMP_TMP = ${JSON.stringify(join(tmpdir(), "code-nav-jump.json"))};\n` +
  readFileSync(bundle, "utf8");
mkdirSync(join(repo, "out", "fresh-plugin"), { recursive: true });
writeFileSync(staged, wrapper);

const configDir = freshConfigDir();
const plugins = join(configDir, "plugins");
mkdirSync(plugins, { recursive: true });
preserveLegacyPlugin(plugins);

const installed = join(plugins, "code-graph.ts");
// Older installs used a symlink into out/. Copying through it would overwrite
// the build artifact, so move the link aside first.
if (existsSync(installed) && lstatSync(installed).isSymbolicLink()) {
  renameSync(installed, `${installed}.bak-${Date.now()}`);
}
copyFileSync(staged, installed);
console.log(`installed ${installed}`);
console.log("Fresh commands: Code Graph: Open (cbm) / Code Graph: Open (SCIP)");
