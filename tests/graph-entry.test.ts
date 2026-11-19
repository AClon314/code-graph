import { describe, expect, test } from "bun:test";

import { bundleForRef, normalizeEntry } from "../src/lib/graph/entry";
import { refForProject } from "../src/lib/graph/ref-project";
import { fetchProjectsFor, fetchRootsFor } from "../src/lib/graph/loaders";
import type { SymbolBundle } from "../src/lib/graph/types";

describe("graph entry helpers", () => {
  test("normalizes qualified names and id entries", () => {
    expect(normalizeEntry("  pkg.App.run  ")).toBe("pkg.App.run");
    expect(normalizeEntry("#42")).toBe("#42");
    expect(normalizeEntry("#x")).toBeNull();
    expect(normalizeEntry("bad name")).toBeNull();
    expect(normalizeEntry("   ")).toBeNull();
  });

  test("retargets project-qualified entries only", () => {
    expect(refForProject("old.src.App", "old", "new")).toBe("new.src.App");
    expect(refForProject("#42", "old", "new")).toBe("#42");
    expect(refForProject("src.App", "old", "new")).toBe("src.App");
  });

  test("reuses a bundle only for its own root", () => {
    const bundle: SymbolBundle = {
      node: { id: 7, label: "Function", name: "run", qualifiedName: "pkg.run" },
      callers: [],
      callees: [],
    };
    expect(bundleForRef(bundle, "pkg.run")).toBe(bundle);
    expect(bundleForRef(bundle, "#7")).toBe(bundle);
    expect(bundleForRef(bundle, "pkg.other")).toBeUndefined();
    expect(bundleForRef(null, "pkg.run")).toBeUndefined();
  });

  test("loaders keep computed mode local", async () => {
    expect(await fetchProjectsFor("computed", async () => ({ status: 500, body: "" }))).toEqual([
      "demo",
    ]);
    expect((await fetchRootsFor("computed", "", "demo")).map((root) => root.name)).toEqual([
      "main",
    ]);
  });
});
