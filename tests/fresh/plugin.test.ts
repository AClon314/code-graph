import { test } from "bun:test";

import {
  cleanupFresh,
  createFreshFixture,
  launchFresh,
  timedFresh,
} from "./harness";

test(
  "opens a static graph, shows help, and opens a selected node",
  { timeout: 45_000 },
  async () => {
    const fixture = createFreshFixture();
    const app = await launchFresh(fixture);
    try {
      await timedFresh("launch and render graph", 5_000, async () => {
        await app.getByText("README.md").first().expect({ timeout: 10_000 });
        await app.getByText("src/main.ts:3").first().expect({ timeout: 20_000 });
      });

      await timedFresh("help", 1_000, async () => {
        await app.press("?");
        await app.getByText("Code Graph — keys").expect();
        await app.press("Escape");
      });

      await timedFresh("entry picker", 2_000, async () => {
        await app.getByText("[E] Entry").click();
        await app.getByText("Select root").expect();
        await app.press("Escape");
      });

      await timedFresh("select and open node", 3_000, async () => {
        await app.getByText("src/main.ts:3").click();
        await app.press("o");
        await app.getByText("export function main() {}").expect({
          timeout: 5_000,
        });
      });
    } finally {
      await app.closeQuiet();
      cleanupFresh(fixture);
    }
  },
);

test(
  "reports a missing cbm project instead of crashing",
  { timeout: 30_000 },
  async () => {
    const fixture = createFreshFixture({ staticFrame: false, project: null });
    const app = await launchFresh(fixture, { staticFrame: false });
    try {
      await app.getByText("README.md").first().expect({ timeout: 10_000 });
      await app.getByText("no cbm project configured").first().expect({ timeout: 20_000 });
    } finally {
      await app.closeQuiet();
      cleanupFresh(fixture);
    }
  },
);
