import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { finishPageIssues, timed, watchPage } from "../e2e/support";

const workspace = fileURLToPath(new URL("../../out/e2e-workspace", import.meta.url));

test("opens the computed Code Graph webview", async ({ page }, testInfo) => {
  const issues = watchPage(page, testInfo);
  await timed(testInfo, "launch code-server", 30_000, async () => {
    await page.goto(`/?folder=${encodeURIComponent(workspace)}`);
    await page.waitForSelector(".monaco-workbench", { timeout: 30_000 });
  });

  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("Code Graph: Open in New Tab");
  await expect(
    page.getByRole("option", { name: "Code Graph: Open in New Tab", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("Code Graph: Open");
  const command = page.getByRole("option", {
    name: "Code Graph: Open",
    exact: true,
  });
  await expect(command).toBeVisible();
  await command.click();

  await expect(page.getByRole("tab", { name: "Code Graph", exact: true })).toBeVisible({
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

  await expect(app.getByRole("button", { name: "Code Graph setup" })).toBeVisible();

  await expect(app.locator(".code-graph-node-html .node-card").first()).toBeVisible({
    timeout: 30_000,
  });
  const firstNode = app.getByRole("button", { name: /useAlias/ }).first();
  await expect(firstNode).toBeVisible({ timeout: 30_000 });
  await firstNode.click();
  const details = app.getByRole("complementary", { name: "forAI" });
  await expect(details).toBeHidden();
  await app.getByRole("button", { name: "forAI panel", exact: true }).click();
  await expect(details).toBeVisible();
  await app.getByRole("button", { name: "Close forAI" }).click();

  await app.locator(".brand-pill").click();
  await expect(app.getByRole("button", { name: "Computed", exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Close setup" }).click();

  await app.getByRole("button", { name: "Toggle search" }).click();
  await app.getByLabel("Search graph").fill("UserRepo");
  await app.getByLabel("Search graph").press("Enter");
  await expect(details).toBeHidden();
  await app.getByRole("button", { name: "forAI panel", exact: true }).click();
  await expect(details).toBeVisible();
  await expect(details.locator(".ai-raw")).toContainText("UserRepo");
  await timed(testInfo, "jump to source", 10_000, async () => {
    await app.getByRole("button", { name: /UserRepo/ }).first().dblclick();
    await expect(page.getByRole("tab", { name: /user-repo\.ts/ })).toBeVisible({
      timeout: 30_000,
    });
  });
  finishPageIssues(issues, testInfo);
});
