import { expect, test } from "bun:test";

import {
  ComputedSource,
  computedDisplayRef,
  computedRootCandidates,
  resolveComputedRef,
} from "../src/lib/graph/computed";

test("computed paths resolve files, folders and absolute paths", () => {
  expect(resolveComputedRef("src/features.ts")).toBe("demo.src.features.useAlias");
  expect(resolveComputedRef("src/lib/")).toBe("demo.src.lib.user-repo.UserRepo");
  expect(resolveComputedRef("/home/me/repo/src/lib/base.ts")).toBe(
    "demo.src.lib.base.BaseRepo.get",
  );
  expect(resolveComputedRef("src/main.ts:12:3")).toBe("demo.src.main.main");
  expect(resolveComputedRef("demo.src.main.main")).toBe("demo.src.main.main");
  expect(resolveComputedRef("missing.ts")).toBeNull();
  expect(computedDisplayRef("demo.src.main.main")).toBe("src/main.ts");
});

test("computed roots expose paths as picker values", () => {
  const roots = computedRootCandidates();
  expect(roots.map((root) => root.value)).toContain("src/main.ts");
  expect(roots.map((root) => root.display)).toContain("src/lib/");
  expect(roots.every((root) => root.value && root.qualifiedName)).toBe(true);
});

test("computed source loads a graph from a path", async () => {
  const bundle = await new ComputedSource().symbol("demo", "src/lib/user-repo.ts");
  expect(bundle.node.qualifiedName).toBe("demo.src.lib.user-repo.UserRepo");
  await expect(new ComputedSource().symbol("demo", "nope.ts")).rejects.toThrow(
    "computed path or symbol not found",
  );
});
