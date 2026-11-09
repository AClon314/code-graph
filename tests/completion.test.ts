import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeRootsCache } from "../src/cli/lib/roots-cache";

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "bin/run.ts", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 1,
  };
}

test("completion generates zsh and powershell scripts", () => {
  const visible = run(["completion", "zsh"]);
  expect(visible.exitCode).toBe(0);
  expect(visible.stdout).toContain("#compdef code-graph");

  const zsh = run(["completion", "zsh"]);
  expect(zsh.exitCode).toBe(0);
  expect(zsh.stdout).toContain("#compdef code-graph");

  const powershell = run(["completion", "powershell"]);
  expect(powershell.exitCode).toBe(0);
  expect(powershell.stdout.toLowerCase()).toContain("powershell");
});

test("symbol-entry completion reads roots.json synchronously", () => {
  const root = mkdtempSync(join(tmpdir(), "code-graph-completion-"));
  writeRootsCache(root, "p", [
    {
      qualifiedName: "p.src.App",
      name: "App",
      label: "Module",
      filePath: "src/App.svelte",
      startLine: 1,
      reason: "module",
      kind: "module",
    },
  ]);

  const result = run([
    "complete",
    "--",
    "render",
    "--root",
    root,
    "--project",
    "p",
    "--symbol-entry",
    "",
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("p.src.App");
});
