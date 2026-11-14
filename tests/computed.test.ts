import { expect, test } from "bun:test";

import {
  ComputedSource,
} from "../src/lib/graph/computed";

test("computed source resolves the offline symbol bundle", async () => {
  const bundle = await new ComputedSource().symbol("demo", "demo.src.main.main");
  expect(bundle.node.qualifiedName).toBe("demo.src.main.main");
  await expect(new ComputedSource().symbol("demo", "missing")).rejects.toThrow(
    "computed symbol not found",
  );
});
