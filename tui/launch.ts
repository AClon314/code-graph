#!/usr/bin/env bun
/**
 * Start the local cbm UI when needed, then launch Fresh in this terminal.
 *
 * `tui/install.ts` stays install-only. `bun run tui` runs both so the plugin
 * and its backend are ready without another command. Set TUI_NO_START=1 to
 * install only, CBM_AUTOSTART=0 to leave cbm alone, or CBM_HTTP=... to use an
 * explicit remote/tunneled endpoint.
 */
import { execFileSync, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const DEFAULT_PORT = "9749";

if (process.env.TUI_NO_START === "1") {
  console.log("TUI_NO_START=1: plugin installed; run `fresh` manually.");
  process.exit(0);
}
if (!process.stdin.isTTY) {
  console.log("not an interactive terminal: plugin installed; run `fresh` manually.");
  process.exit(0);
}

function cbmBinary(): string | null {
  const explicit = process.env.CBM_BIN?.trim();
  if (explicit) return explicit;
  return Bun.which("codebase-memory-mcp");
}

function cbmPort(binary: string | null): string {
  const explicit = process.env.CBM_PORT?.trim();
  if (explicit) return explicit;
  if (!binary) return DEFAULT_PORT;
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
    // fall through to the default
  }
  return DEFAULT_PORT;
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

async function startCbm(binary: string, port: string): Promise<void> {
  if (await healthy(port)) {
    console.log(`cbm already running: http://127.0.0.1:${port}/`);
    return;
  }

  mkdirSync(join(repo, "out"), { recursive: true });
  const log = openSync(join(repo, "out", "cbm.log"), "a");
  const child = spawn(binary, ["--ui=true", `--port=${port}`], {
    stdio: ["pipe", log, log],
    env: process.env,
    shell: process.platform === "win32",
  });
  closeSync(log);
  child.once("error", (error) => {
    console.error(`cbm failed to start: ${error.message}`);
  });

  for (let i = 0; i < 30; i += 1) {
    if (await healthy(port)) {
      console.log(`cbm ready: http://127.0.0.1:${port}/`);
      return;
    }
    await Bun.sleep(200);
  }
  console.warn(`cbm did not become healthy; see ${join(repo, "out", "cbm.log")}`);
}

const explicitEndpoint = Boolean(process.env.CBM_HTTP?.trim());
const autostart = process.env.CBM_AUTOSTART !== "0";
const binary = autostart && !explicitEndpoint ? cbmBinary() : null;
const configuredPort = process.env.CBM_PORT?.trim() || null;
// With autostart off, leave discovery to the cbm CLI instead of forcing 9749.
const port = explicitEndpoint ? null : autostart ? cbmPort(binary) : configuredPort;

if (binary) {
  if (port) await startCbm(binary, port);
} else if (!explicitEndpoint) {
  console.warn("codebase-memory-mcp not found; start cbm manually or set CBM_BIN.");
}

const env: NodeJS.ProcessEnv = { ...process.env };
if (binary) env.CBM_BIN = binary;
if (port) env.CBM_PORT = port;

const fresh = spawn(process.env.FRESH_BIN || "fresh", [], {
  stdio: "inherit",
  env,
});

const code = await new Promise<number>((resolveCode) => {
  fresh.once("error", (error) => {
    console.error(`cannot start fresh: ${error.message}`);
    resolveCode(127);
  });
  fresh.once("exit", (exitCode) => resolveCode(exitCode ?? 0));
});
process.exit(code);
