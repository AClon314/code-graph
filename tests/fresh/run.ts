#!/usr/bin/env bun
/**
 * Run the Fresh e2e tests with a Termwright-supported Node (22/24).
 *
 * The shell's `node` may be newer (this checkout often has Node 25 on PATH),
 * while Termwright's native host is certified only for Node 22/24. Resolve an
 * explicit NODE_BIN first, then the usual system locations.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const candidates = [
  process.env.NODE_BIN,
  "node-22",
  "/usr/bin/node",
  "node",
].filter((value): value is string => Boolean(value));

function major(binary: string): number | null {
  try {
    const output = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const match = output.trim().match(/^v(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

const node = candidates.find((binary) => {
  const version = major(binary);
  return version === 22 || version === 24;
});
if (!node) {
  console.error(
    "termwright needs Node 22 or 24; set NODE_BIN or install one of them.",
  );
  process.exit(127);
}

const bin = resolve(root, "node_modules/termwright/dist/bin.js");
execFileSync(node, [bin, "test", "--", "tests/fresh", "--exclude", ".code-server/**"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
