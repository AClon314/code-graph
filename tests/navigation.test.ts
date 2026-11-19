import { expect, test } from "bun:test";

import { adjacentSibling, firstNeighbor } from "../src/lib/graph/navigation";
import type { GraphViewData } from "../src/lib/graph/types";

const DATA: GraphViewData = {
  root: "root",
  truncated: false,
  nodes: [
    { id: "root", label: "Function", name: "root", qualifiedName: "root" },
    { id: "a", label: "Function", name: "a", qualifiedName: "a" },
    { id: "b", label: "Function", name: "b", qualifiedName: "b" },
    { id: "c", label: "Function", name: "c", qualifiedName: "c" },
  ],
  edges: [
    { id: "r-a", source: "root", target: "a", type: "CALLS" },
    { id: "r-b", source: "root", target: "b", type: "CALLS" },
    { id: "a-c", source: "a", target: "c", type: "CALLS" },
  ],
};

test("first neighbour follows edge direction in graph order", () => {
  expect(firstNeighbor(DATA, "root", "callees")?.id).toBe("a");
  expect(firstNeighbor(DATA, "c", "callers")?.id).toBe("a");
  expect(firstNeighbor(DATA, "root", "callers")).toBeUndefined();
});

test("siblings share a first caller and do not wrap", () => {
  expect(adjacentSibling(DATA, "a", 1)?.id).toBe("b");
  expect(adjacentSibling(DATA, "b", -1)?.id).toBe("a");
  expect(adjacentSibling(DATA, "b", 1)).toBeUndefined();
  expect(adjacentSibling(DATA, "c", 1)).toBeUndefined();
});
