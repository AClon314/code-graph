import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const workspace = fileURLToPath(new URL("../../out/e2e-workspace", import.meta.url));

test("opens the computed Code Graph webview", async ({ page }) => {
  await page.goto(`/?folder=${encodeURIComponent(workspace)}`);
  await page.waitForSelector(".monaco-workbench", { timeout: 30_000 });

  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("Code Graph: Open (cbm)");
  const command = page.getByRole("option", {
    name: "Code Graph: Open (cbm)",
    exact: true,
  });
  await expect(command).toBeVisible();
  await command.click();

  await expect(page.getByRole("tab", { name: /Code Graph \(cbm\)/ })).toBeVisible({
    timeout: 30_000,
  });

  // The app runs in a nested vscode-webview iframe whose URL is the Svelte app.
  await expect
    .poll(() => page.frames().some((frame) => frame.url().includes("source=computed")), {
      timeout: 30_000,
    })
    .toBe(true);
  const app = page.frames().find((frame) => frame.url().includes("source=computed"));
  if (!app) throw new Error("Code Graph webview frame not found");

  await expect(app.locator("h1")).toHaveText("Code Graph");

  const firstNode = app.locator("[data-node-id]").first();
  await expect(firstNode).toBeVisible({ timeout: 30_000 });
  await firstNode.click();
  await expect(app.getByRole("complementary", { name: "Symbol details" })).toBeVisible();
  await app.getByRole("button", { name: "Close details" }).click();

  await app.getByRole("button", { name: "Setup", exact: true }).click();
  await expect(app.getByRole("button", { name: "Computed", exact: true })).toBeVisible();
});
