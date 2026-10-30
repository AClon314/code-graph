#!/usr/bin/env bun
/**
 * Link a workspace frame into the user cache index.
 *
 *   <workspace>/.codebase-memory/code-graph/cbm/frame.json
 *     -> ~/.cache/code-graph/frames/<key>.json
 *
 * The workspace file is authoritative; the user-cache entry is a convenience
 * index for tools that do not know the workspace path. The link is replaced
 * atomically so readers never see a half-written target.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    frame: { type: "string" },
    root: { type: "string" },
    backend: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: false,
});

if (values.help || !values.frame || !values.root || !values.backend) {
  console.log(`Usage: bun run tui/cache-link.ts --frame <path> --root <workspace> --backend <cbm|scip>

Creates ~/.cache/code-graph/frames/<key>.json -> <frame>.`);
  process.exit(values.help ? 0 : 2);
}

const frame = resolve(values.frame);
const root = resolve(values.root);
if (!existsSync(frame)) {
  console.error(`cache-link: frame not found: ${frame}`);
  process.exit(1);
}
const backend = values.backend;
if (backend !== "cbm" && backend !== "scip") {
  console.error(`cache-link: unknown backend "${backend}"`);
  process.exit(2);
}

const key = cacheKey(root, backend);
const cacheRoot = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
const link = join(cacheRoot, "code-graph", "frames", `${key}.json`);
mkdirSync(dirname(link), { recursive: true });

const temp = `${link}.${process.pid}.tmp`;
symlinkSync(frame, temp);
renameSync(temp, link);
console.log(link);

function cacheKey(root: string, backend: string): string {
  return createHash("sha256")
    .update(root)
    .update("\0")
    .update(backend)
    .digest("hex")
    .slice(0, 16);
}
