import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRootsCache, removeRootsCache, writeRootsCache } from "../src/cli/lib/roots-cache";

describe("project cleanup", () => {
  test("removes only the deleted project from the roots cache", () => {
    const root = mkdtempSync(join(tmpdir(), "code-graph-projects-"));
    try {
      writeRootsCache(root, "keep", []);
      writeRootsCache(root, "old", []);
      removeRootsCache(root, "old");
      expect(Object.keys(readRootsCache(root).projects)).toEqual(["keep"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
