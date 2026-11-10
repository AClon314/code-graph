import { defineConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CODE_SERVER_TEST_PORT || "8099");
const e2eWorkspace = fileURLToPath(new URL("./out/e2e-workspace", import.meta.url));
// Keep the e2e code-server profile disjoint from the manual one under
// .code-server, so tests cannot overwrite its last-opened folder.
const e2eProfile = fileURLToPath(new URL("./out/e2e-code-server", import.meta.url));

// Keep the e2e workspace out of the source tree: write only the files the
// smoke test needs, with mock source configured.
mkdirSync(join(e2eWorkspace, ".vscode"), { recursive: true });
writeFileSync(join(e2eWorkspace, "README.md"), "# fixture\n");
writeFileSync(
  join(e2eWorkspace, ".vscode", "settings.json"),
  `${JSON.stringify(
    {
      "codeGraph.source": "mock",
      "codeGraph.project": "demo",
      "codeGraph.symbolEntry": "demo.src.features.useAlias",
    },
    null,
    2,
  )}\n`,
);

export default defineConfig({
  testDir: "./tests/vscode",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run gui:private",
    url: `https://127.0.0.1:${port}/`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    env: {
      PORT: String(port),
      HOST: "127.0.0.1",
      AUTH: "none",
      CBM_AUTOSTART: "0",
      WORKSPACE: e2eWorkspace,
      CODE_SERVER_DATA_DIR: join(e2eProfile, "data"),
      CODE_SERVER_EXTENSIONS_DIR: join(e2eProfile, "extensions"),
    },
  },
});
