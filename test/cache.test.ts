import { expect, test } from "bun:test";

import { frameCacheDir, frameCachePath, panelName } from "../src/lib/graph/cache";

test("frame cache is per workspace and backend", () => {
  expect(frameCacheDir("/repo/", "cbm")).toBe(
    "/repo/.codebase-memory/code-graph/cbm",
  );
  expect(frameCachePath("/repo", "scip")).toBe(
    "/repo/.codebase-memory/code-graph/scip/frame.json",
  );
  expect(panelName("cbm")).toContain("cbm");
  expect(panelName("scip")).toContain("SCIP");
});
