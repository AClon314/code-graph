import { describe, expect, test } from "bun:test";

import { applyNodeRenderer } from "../tui/frame";
import { toGraphDocument } from "../src/lib/graph/orchgraph";
import type { GraphViewData } from "../src/lib/graph/types";

const view: GraphViewData = {
  root: "demo.src.main",
  nodes: [
    { id: "demo.src.main", label: "Function", name: "main", qualifiedName: "demo.src.main" },
    { id: "demo.src.util", label: "Function", name: "util", qualifiedName: "demo.src.util" },
  ],
  edges: [{ id: "main->util", source: "demo.src.main", target: "demo.src.util", type: "CALLS" }],
  truncated: false,
};

describe("Fresh node renderer", () => {
  test("turns text into label/detail lines before layout", () => {
    const doc = toGraphDocument(view);
    applyNodeRenderer(doc, view, ({ node, graph }) => `${node.name}\n${graph.project}\n${node.shortName}`);
    const main = doc.nodes.find((node) => node.id === "demo.src.main")!;
    expect(main.label).toBe("main");
    expect(main.detail).toBe("demo\nsrc.main");
  });

  test("keeps the original label when a renderer returns a blank string", () => {
    const doc = toGraphDocument(view);
    applyNodeRenderer(doc, view, () => "\n");
    expect(doc.nodes[0]!.label).toBe("main");
  });
});
