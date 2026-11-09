import { expect, test } from "bun:test";
import { renderSvgGraph } from "orchgraph/svg";

import { layoutGraphView } from "../src/lib/graph/layout";
import { toGraphDocument, toGraphGeometry } from "../src/lib/graph/orchgraph";
import type { GraphViewData } from "../src/lib/graph/types";

const DATA: GraphViewData = {
  root: "a",
  truncated: false,
  nodes: [
    { id: "a", label: "Function", name: "a", qualifiedName: "a", filePath: "a.ts", startLine: 1 },
    { id: "b", label: "Method", name: "b", qualifiedName: "b", filePath: "b.ts", startLine: 2 },
  ],
  edges: [{ id: "call", source: "a", target: "b", type: "CALLS" }],
};

test("orchgraph receives the shared document and ELK geometry", async () => {
  const document = toGraphDocument(DATA);
  expect(document.nodes.map((node) => node.id)).toEqual(["a", "b"]);
  expect(document.edges[0]).toMatchObject({ source: "a", target: "b", kind: "CALLS" });

  const layout = await layoutGraphView(DATA);
  const geometry = toGraphGeometry(layout);
  expect(geometry.nodes).toHaveLength(2);
  expect(geometry.edges[0]?.sections[0]?.length).toBeGreaterThanOrEqual(2);

  const svg = renderSvgGraph(document, geometry, { includeStyles: false, pixelScale: 1 });
  expect(svg).toContain('class="orchgraph-svg');
  expect(svg).toContain('data-node-id="a"');
  expect(svg).toContain("orchgraph-edge");
  expect(svg).not.toContain("<style>");
});
