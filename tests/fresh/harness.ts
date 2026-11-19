import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TuiTest } from "@microsoft/tui-test";

import { frameCachePath, rootsCachePath } from "../../src/lib/graph/cache";
import type { RootsCache } from "../../src/lib/graph/roots";

const repo = resolve(import.meta.dir, "../..");
const bundle = join(repo, "out", "fresh-plugin", "code-graph.js");
const fresh = process.env.FRESH_BIN || "fresh";

export interface FreshFixture {
  root: string;
  workspace: string;
  configDir: string;
  xdg: string;
}

/** Isolated XDG profile + workspace, so a rerun never touches the real Fresh. */
export function createFreshFixture(
  options: { staticFrame?: boolean; project?: string | null } = {},
): FreshFixture {
  const staticFrame = options.staticFrame ?? true;
  const project = options.project === undefined ? "demo" : options.project;
  const root = mkdtempSync(join(tmpdir(), "cg-fresh-"));
  const xdg = join(root, "xdg");
  const configDir = join(xdg, "fresh");
  const workspace = join(root, "workspace");
  mkdirSync(join(workspace, "src", "lib"), { recursive: true });
  mkdirSync(join(configDir, "plugins"), { recursive: true });
  writeFileSync(join(workspace, "README.md"), "# fixture\n");
  writeFileSync(join(workspace, "src", "main.ts"), "export function main() {}\n");
  writeFileSync(join(workspace, "src", "features.ts"), "export function useAlias() {}\n");
  writeFileSync(join(workspace, "src", "lib", "user-repo.ts"), "export class UserRepo {}\n");
  writeFileSync(join(workspace, "src", "lib", "base.ts"), "export class BaseRepo { get() {} }\n");
  writeFileSync(join(workspace, "src", "lib", "loader.ts"), "export function loadUser() {}\n");
  writeFileSync(join(workspace, "src", "lib", "format.ts"), "export function formatUser() {}\n");

  if (staticFrame) {
    const framePath = frameCachePath(workspace, "cbm");
    mkdirSync(join(framePath, ".."), { recursive: true });
    execFileSync(
      process.execPath,
      [
        "run",
        "tui/render.ts",
        "--graph",
        "tui/fixture-graph.json",
        "--out",
        framePath,
      ],
      { cwd: repo, stdio: ["ignore", "ignore", "pipe"] },
    );
  }

  const roots: RootsCache = {
    version: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    projects: {
      demo: {
        roots: [
          {
            qualifiedName: "demo.src.main.main",
            name: "main",
            label: "Function",
            filePath: "src/main.ts",
            startLine: 3,
            reason: "entry",
            kind: "entry",
          },
          {
            qualifiedName: "demo.src.features.useAlias",
            name: "useAlias",
            label: "Function",
            filePath: "src/features.ts",
            startLine: 5,
            reason: "entry",
            kind: "entry",
          },
        ],
      },
    },
  };
  mkdirSync(join(workspace, ".codebase-memory", "code-graph"), { recursive: true });
  writeFileSync(rootsCachePath(workspace), JSON.stringify(roots));

  installPlugin(configDir, root, staticFrame, project);
  writeInit(configDir);
  return { root, workspace, configDir, xdg };
}

function installPlugin(
  configDir: string,
  tmp: string,
  staticFrame: boolean,
  project: string | null,
): void {
  const wrapper =
    `globalThis.CODE_NAV_REPO = ${JSON.stringify(repo)};\n` +
    `globalThis.CODE_NAV_BUN = ${JSON.stringify(process.execPath)};\n` +
    `globalThis.CODE_NAV_JUMP_TMP = ${JSON.stringify(join(tmp, "jump.json"))};\n` +
    (project === null
      ? ""
      : `globalThis.CODE_NAV_CBM_PROJECT = ${JSON.stringify(project)};\n` +
        `globalThis.CODE_NAV_ENTRY = "demo.src.features.useAlias";\n`) +
    `globalThis.CODE_NAV_FRAME_MODE = ${JSON.stringify(staticFrame ? "static" : "cbm")};\n` +
    readFileSync(bundle, "utf8");
  writeFileSync(join(configDir, "plugins", "code-graph.ts"), wrapper);
}

function writeInit(configDir: string): void {
  writeFileSync(
    join(configDir, "init.ts"),
    `const editor = getEditor();
let tries = 0;
const timer = editor.setInterval(100, "test_open_code_graph");
registerHandler("test_open_code_graph", async () => {
  tries += 1;
  if (tries > 50) {
    editor.clearInterval(timer);
    return;
  }
  try {
    await editor.runCommand("Code Graph: Open (cbm)");
    editor.clearInterval(timer);
  } catch {
    // Plugin commands load after init.ts; retry until they exist.
  }
});
`,
  );
}

export async function launchFresh(
  fixture: FreshFixture,
  options: { env?: Record<string, string>; staticFrame?: boolean } = {},
): Promise<TuiTest> {
  const terminal = TuiTest.ephemeral("cg-fresh-test");
  await terminal.run(fresh, ["README.md"], {
    cwd: fixture.workspace,
    env: {
      XDG_CONFIG_HOME: fixture.xdg,
      CODE_NAV_FRAME_MODE: options.staticFrame === false ? "cbm" : "static",
      ...options.env,
    },
    cols: 120,
    rows: 40,
  });
  return terminal;
}

export function cleanupFresh(fixture: FreshFixture): void {
  rmSync(fixture.root, { recursive: true, force: true });
}

/** TUI tests have no testInfo; log slow steps without failing. */
export async function timedFresh<T>(
  label: string,
  budgetMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await action();
  } finally {
    const elapsed = Math.round(performance.now() - started);
    if (elapsed > budgetMs) {
      console.warn(`[e2e slow] fresh ${label}: ${elapsed}ms > ${budgetMs}ms`);
    }
  }
}
