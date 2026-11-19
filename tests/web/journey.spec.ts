import { expect, test } from "@playwright/test";

import { finishPageIssues, timed, watchPage } from "../e2e/support";

const startUrl =
  "/?source=computed&project=demo&symbol=demo.src.features.useAlias&depth=2&direction=both&layout=layered";

test("project → entry bar → search → jump", async ({ page }, testInfo) => {
  const issues = watchPage(page, testInfo);

  await timed(testInfo, "load app", 4_000, async () => {
    await page.goto(startUrl);
    await expect(page.getByRole("heading", { name: "Code Graph" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Call graph for demo\.src\.features\.useAlias/ })).toBeVisible();
  });

  await timed(testInfo, "open project setup", 1_500, async () => {
    await page.getByRole("button", { name: /demo.*computed/ }).click();
    const setup = page.getByRole("complementary", { name: "Setup" });
    await expect(setup).toBeVisible();
    await expect(page.getByLabel("Project", { exact: true })).toHaveValue("demo");
    await page.getByRole("button", { name: "Close setup" }).click();
    await expect(setup).toBeHidden();
  });

  await timed(testInfo, "change symbol entry", 4_000, async () => {
    await page.getByLabel("Symbol entry (qualified name or #id)").click();
    const entry = page.getByRole("combobox", {
      name: "Symbol entry (qualified name or #id)",
    });
    await entry.press("Control+A");
    await entry.pressSequentially("demo.src.main.main");
    await expect(
      page.getByRole("group", { name: /Call graph for demo\.src\.main\.main/ }),
    ).toBeVisible();
  });

  await timed(testInfo, "search and inspect", 3_000, async () => {
    await page.getByLabel("Search graph").fill("UserRepo");
    await page.getByLabel("Search graph").press("Enter");
    const details = page.getByRole("complementary", { name: "Symbol details" });
    await expect(details).toBeVisible();
    await expect(details.getByRole("heading", { name: "UserRepo" })).toBeVisible();
  });

  await timed(testInfo, "jump to source", 3_000, async () => {
    await page.getByRole("button", { name: "Jump", exact: true }).click();
    await expect(page.getByText("Opened src/lib/user-repo.ts:2:1")).toBeVisible();
  });

  finishPageIssues(issues, testInfo);
});

test("view options round-trip through the URL", async ({ page }, testInfo) => {
  const issues = watchPage(page, testInfo);

  await timed(testInfo, "load graph", 4_000, async () => {
    await page.goto("/?source=computed&project=demo&symbol=demo.src.features.useAlias");
    await expect(page.getByRole("group", { name: /Call graph for/ })).toBeVisible();
  });

  await timed(testInfo, "set depth", 2_000, async () => {
    const depth = page.getByLabel("Neighborhood depth");
    await depth.fill("3");
    await depth.press("Enter");
    await expect(page).toHaveURL(/depth=3/);
  });

  await timed(testInfo, "switch layout", 2_000, async () => {
    await page.getByLabel("Layout algorithm").selectOption("radial");
    await expect(page).toHaveURL(/layout=radial/);
  });

  await timed(testInfo, "reload and restore view", 3_000, async () => {
    await page.reload();
    await expect(page.getByLabel("Neighborhood depth")).toHaveValue("3");
    await expect(page.getByLabel("Layout algorithm")).toHaveValue("radial");
  });

  await timed(testInfo, "empty depth = full graph", 4_000, async () => {
    await page.getByLabel("Neighborhood depth").fill("");
    await page.getByLabel("Neighborhood depth").press("Enter");
    await expect(page).toHaveURL(/[?&]depth=(?:&|$)/);
    await expect(page.getByRole("group", { name: /Call graph for/ })).toBeVisible();
  });

  finishPageIssues(issues, testInfo);
});
