import { describe, expect, test } from "bun:test";

import { focusSubgraph, relatedSelection } from "../src/lib/graph/selection";
import type { GraphViewData } from "../src/lib/graph/types";

const data: GraphViewData = {
  root: "a",
  nodes: ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    label: "Function",
    name: id,
    qualifiedName: id,
  })),
  edges: [
    { id: "a->b", source: "a", target: "b", type: "CALLS" },
    { id: "b->c", source: "b", target: "c", type: "CALLS" },
    { id: "d->e", source: "d", target: "e", type: "CALLS" },
  ],
  truncated: false,
};

describe("selection neighbourhood", () => {
  test("follows edges in both directions", () => {
    const related = relatedSelection(data, "b");
    expect([...related.nodes].sort()).toEqual(["a", "b", "c"]);
    expect([...related.edges].sort()).toEqual(["a->b", "b->c"]);
  });

  test("does not include disconnected components", () => {
    const related = relatedSelection(data, "a");
    expect(related.nodes.has("d")).toBe(false);
    expect(focusSubgraph(data, "a").nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  test("an empty or stale selection leaves the full graph alone", () => {
    expect(focusSubgraph(data, "")).toBe(data);
    expect(focusSubgraph(data, "missing")).toBe(data);
  });
});
