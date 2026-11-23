import { describe, expect, test } from "bun:test";

import { copyTargetFor } from "../src/lib/actions/copy";
import type { GraphViewData, GraphViewNode } from "../src/lib/graph/types";

const graph: GraphViewData = {
  root: "pkg.main",
  nodes: [
    {
      id: "pkg.main",
      label: "Function",
      name: "main",
      qualifiedName: "pkg.main",
      filePath: "src/main.ts",
      startLine: 4,
    },
    {
      id: "pkg.helper",
      label: "Function",
      name: "helper",
      qualifiedName: "pkg.helper",
      filePath: "src/helper.ts",
      startLine: 9,
    },
  ],
  edges: [],
  truncated: false,
};

describe("copy target", () => {
  test("falls back to the graph root when nothing is selected", () => {
    const target = copyTargetFor(graph, null, null, "/workspace", "pkg");
    expect(target.row?.filePath).toBe("src/main.ts");
    expect(target.context?.json.self).toBe("pkg//src/main.ts#main");
  });

  test("uses the selected node when present", () => {
    const selected = graph.nodes[1] as GraphViewNode;
    const target = copyTargetFor(graph, selected, null, "/workspace", "pkg");
    expect(target.row?.filePath).toBe("src/helper.ts");
    expect(target.context?.json.self).toBe("pkg//src/helper.ts#helper");
  });
});
