#!/usr/bin/env bun
/**
 * Start the local codebase-memory-mcp UI/HTTP service.
 *
 * Resolution order:
 *   1. CBM_BIN
 *   2. codebase-memory-mcp on PATH (e.g. `bun i -g codebase-memory-mcp`)
 *   3. legacy local runtime at rules/cbm-runtime
 *
 * The port comes from CBM_PORT, then `codebase-memory-mcp config get ui_port`,
 * then 9749. An already healthy service is not started twice.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const localBinary = resolve(
  repo,
  "../../cbm-runtime/node_modules/.bin",
  process.platform === "win32" ? "codebase-memory-mcp.cmd" : "codebase-memory-mcp",
);

function resolveBinary(): string {
  const explicit = process.env.CBM_BIN?.trim();
  if (explicit) return explicit;

  const onPath = Bun.which("codebase-memory-mcp");
  if (onPath) return onPath;

  if (existsSync(localBinary)) return localBinary;

  throw new Error(
    "codebase-memory-mcp not found. Run `bun i -g codebase-memory-mcp@0.12.1`, " +
      "put it on PATH, or set CBM_BIN.",
  );
}

function configuredPort(binary: string): string {
  const explicit = process.env.CBM_PORT?.trim();
  if (explicit) return explicit;

  try {
    const output = execFileSync(binary, ["config", "get", "ui_port"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
      shell: process.platform === "win32",
    });
    const value = output.trim().split(/\s+/).at(-1) ?? "";
    if (/^\d+$/.test(value)) return value;
  } catch {
    // Older/newer wrappers may not expose `config get`; use the default.
  }
  return "9749";
}

async function healthy(port: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ui-config`, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const binary = resolveBinary();
const port = configuredPort(binary);

if (await healthy(port)) {
  console.log(`cbm already running: http://127.0.0.1:${port}/`);
  process.exit(0);
}

console.log(`starting cbm: http://127.0.0.1:${port}/`);
console.log(`binary: ${binary}`);

const child = spawn(binary, ["--ui=true", `--port=${port}`], {
  stdio: ["pipe", "inherit", "inherit"],
  env: process.env,
  shell: process.platform === "win32",
});

const forward = (signal: NodeJS.Signals): void => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

const code = await new Promise<number>((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (exitCode) => resolveExit(exitCode ?? 0));
});
process.exit(code);
