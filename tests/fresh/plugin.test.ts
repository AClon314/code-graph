import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "termwright/test";

const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const bundle = join(repo, "out", "fresh-plugin", "code-graph.js");
const fresh = process.env.FRESH_BIN || "fresh";

function installTestPlugin(configDir: string, tmpdir: string): void {
  const plugins = join(configDir, "plugins");
  mkdirSync(plugins, { recursive: true });
  const wrapper =
    `globalThis.CODE_NAV_REPO = ${JSON.stringify(repo)};\n` +
    `globalThis.CODE_NAV_BUN = ${JSON.stringify(process.env.BUN || "bun")};\n` +
    `globalThis.CODE_NAV_JUMP_TMP = ${JSON.stringify(join(tmpdir, "jump.json"))};\n` +
    readFileSync(bundle, "utf8");
  writeFileSync(join(plugins, "code-graph.ts"), wrapper);
}

test("opens Code Graph and reports a missing project", { timeout: 30_000 }, async ({ terminal }) => {
  const tmpdir = terminal.tmpdir;
  const xdg = join(tmpdir, "xdg");
  const configDir = join(xdg, "fresh");
  installTestPlugin(configDir, tmpdir);
  const workspace = join(tmpdir, "workspace");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "README.md"), "# fixture\n");
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

  const app = await terminal.launch({
    command: [fresh, "README.md"],
    cwd: workspace,
    envMode: "inherit",
    env: {
      XDG_CONFIG_HOME: xdg,
      CODE_NAV_FRAME_MODE: "cbm",
    },
    columns: 120,
    rows: 40,
  });

  await app.waitForText("README.md");
  // The init script dispatches the real command once plugins have registered;
  // keep the test independent of terminal keybinding/protocol quirks.
  await expect(app).toHaveText("no cbm project configured");
});
