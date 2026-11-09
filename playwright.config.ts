import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const port = Number(process.env.CODE_SERVER_TEST_PORT || "8099");
const fixtureWorkspace = fileURLToPath(new URL("./fixtures/workspace", import.meta.url));

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
      WORKSPACE: fixtureWorkspace,
    },
  },
});
