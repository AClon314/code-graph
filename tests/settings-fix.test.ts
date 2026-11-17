import { describe, expect, test } from "bun:test";

import { cbmUrlFix, fixFor } from "../src/lib/settings-fix";

describe("settings fixes", () => {
  test("routes missing projects to the active backend setting", () => {
    expect(fixFor(new Error("unknown project: demo"), "cbm").query).toBe(
      "codeGraph.cbmProject",
    );
    expect(fixFor(new Error("project not found"), "scip").query).toBe(
      "codeGraph.scipProject",
    );
  });

  test("routes symbol errors and falls back to the cbm URL", () => {
    expect(fixFor(new Error("symbol entry missing"), "cbm").query).toBe(
      "codeGraph.symbolEntry",
    );
    expect(fixFor(new Error("connection refused"), "cbm")).toEqual(cbmUrlFix());
  });
});
