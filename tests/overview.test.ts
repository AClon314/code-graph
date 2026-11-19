import { expect, test } from "bun:test";

import { rootsOverview } from "../src/lib/graph/overview";

test("roots overview dedupes roots into one edge-less graph", () => {
  const graph = rootsOverview([
    { qualifiedName: "p.main", name: "main", label: "Function", filePath: "main.ts", startLine: 1, reason: "main", kind: "entry" },
    { qualifiedName: "p.main", name: "main", label: "Function", filePath: "main.ts", startLine: 1, reason: "main", kind: "entry" },
    { qualifiedName: "p.App", name: "App", label: "Class", filePath: "App.svelte", startLine: 1, reason: "class", kind: "class" },
  ]);
  expect(graph.root).toBe("");
  expect(graph.nodes.map((node) => node.id)).toEqual(["p.main", "p.App"]);
  expect(graph.edges).toEqual([]);
  expect(graph.nodes[0]).toMatchObject({ filePath: "main.ts", startLine: 1, isEntry: true });
});
