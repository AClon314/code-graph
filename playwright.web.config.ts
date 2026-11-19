import { defineConfig, devices } from "@playwright/test";

import { performanceOptions, performancePort } from "./tests/e2e/performance";

const port = Number(process.env.CODE_GRAPH_WEB_TEST_PORT || "5174");
const bridgePort = Number(process.env.CODE_NAV_TEST_PORT || "9752");

export default defineConfig({
  testDir: "./tests/web",
  outputDir: "test-results/web",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/web", open: "never" }],
    ["playwright-performance-reporter", performanceOptions],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: {
      args: [`--remote-debugging-port=${performancePort}`],
    },
  },
  webServer: [
    {
      // The standalone browser host uses the offline computed source; no cbm
      // daemon or indexed project is required.
      command: "bun run web",
      url: `http://127.0.0.1:${port}/`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        CBM_AUTOSTART: "0",
        WEB_HOST: "127.0.0.1",
        WEB_PORT: String(port),
      },
    },
    {
      // Jump is observable in the browser through the local JSON-RPC bridge.
      command: "bun run jump:bridge",
      url: `http://127.0.0.1:${bridgePort}/health`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: { CODE_NAV_PORT: String(bridgePort) },
    },
  ],
});
