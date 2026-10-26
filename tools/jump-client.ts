#!/usr/bin/env bun
/**
 * Tiny JSON-RPC client used by Fresh's QuickJS plugin.
 *
 * Fresh's `editor.httpFetch` is GET-only (it streams a download to a file), so
 * the plugin spawns this helper instead. The helper holds a long poll open and
 * writes the target (or `null`) atomically for the plugin to read.
 *
 *   bun tools/jump-client.ts next --client fresh --wait 25000 --out /tmp/jump.json
 *   CODE_NAV_BRIDGE=http://127.0.0.1:9752 CODE_NAV_TOKEN=... ...
 *
 * A token is read from `CODE_NAV_TOKEN` or `CODE_NAV_TOKEN_FILE`; never pass it
 * as an argument (argv is visible to other processes).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { JumpClient, JumpRpcError } from "../src/lib/jump/client";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function readToken(): Promise<string | undefined> {
  const direct = process.env.CODE_NAV_TOKEN;
  if (direct) return direct;
  const file =
    process.env.CODE_NAV_TOKEN_FILE ||
    join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "code-nav", "token");
  try {
    return (await readFile(file, "utf8")).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function writeAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, value, "utf8");
  await rename(temp, path);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "next";
  if (command !== "next") {
    console.error(`jump-client: unknown command "${command}" (expected "next")`);
    return 2;
  }

  const client = argValue(args, "--client") ?? "fresh";
  if (client !== "fresh" && client !== "vscode" && client !== "any") {
    console.error(`jump-client: unknown --client "${client}" (expected fresh, vscode, or any)`);
    return 2;
  }
  const waitMs = Number(argValue(args, "--wait") ?? "25000");
  const out = argValue(args, "--out");
  const base = (
    argValue(args, "--base") ||
    process.env.CODE_NAV_BRIDGE ||
    "http://127.0.0.1:9752"
  ).replace(/\/+$/, "");

  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 30_000) {
    console.error("jump-client: --wait must be between 0 and 30000");
    return 2;
  }

  const token = await readToken();
  const jumpClient = new JumpClient({
    baseUrl: base,
    token,
    nextId: () => `fresh-${crypto.randomUUID()}`,
  });

  let result;
  try {
    result = await jumpClient.next({ client, waitMs });
  } catch (cause) {
    if (cause instanceof JumpRpcError) {
      console.error(`jump-client: RPC ${cause.code}: ${cause.message}`);
    } else {
      const detail = cause instanceof Error ? cause.message : String(cause);
      console.error(`jump-client: bridge request failed at ${base}: ${detail}`);
    }
    return 1;
  }

  const target = result?.target ?? null;
  const serialized = target ? JSON.stringify(target) : "null";
  if (out) {
    await writeAtomic(out, serialized);
  } else {
    console.log(serialized);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((cause: unknown) => {
    console.error(`jump-client: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exit(1);
  });
