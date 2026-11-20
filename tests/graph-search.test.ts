import { describe, expect, test } from "bun:test";

import { graphSearchHits, graphSearchResultNodes, stepSearchIndex } from "../src/lib/graph/search";
import { svgFilename } from "../src/lib/graph/svg-export";
import type { GraphViewData } from "../src/lib/graph/types";

const data: GraphViewData = {
  root: "app.main",
  truncated: false,
  edges: [],
  nodes: [
    {
      id: "app.main",
      name: "main",
      qualifiedName: "app.main",
      label: "Function",
    },
    {
      id: "app.UserRepo",
      name: "UserRepo",
      qualifiedName: "app.lib.UserRepo",
      label: "Class",
    },
  ],
};

describe("graph search", () => {
  test("matches names and qualified names case-insensitively", () => {
    expect([...graphSearchHits(data, "USER")]).toEqual(["app.UserRepo"]);
    expect([...graphSearchHits(data, "app.")]).toEqual([
      "app.main",
      "app.UserRepo",
    ]);
  });

  test("returns an empty set for blank queries or no graph", () => {
    expect(graphSearchHits(data, "  ").size).toBe(0);
    expect(graphSearchHits(null, "main").size).toBe(0);
  });

  test("keeps graph order and wraps search navigation", () => {
    const hits = graphSearchHits(data, "app.");
    expect(graphSearchResultNodes(data, hits).map((node) => node.id)).toEqual([
      "app.main",
      "app.UserRepo",
    ]);
    expect(stepSearchIndex(-1, 2, 1)).toBe(0);
    expect(stepSearchIndex(-1, 2, -1)).toBe(1);
    expect(stepSearchIndex(1, 2, 1)).toBe(0);
    expect(stepSearchIndex(0, 2, -1)).toBe(1);
    expect(stepSearchIndex(0, 0, 1)).toBe(-1);
  });
});

describe("SVG export filename", () => {
  test("slugifies the symbol reference", () => {
    expect(svgFilename("app.src.UserRepo")).toBe("code-graph-app-src-UserRepo.svg");
    expect(svgFilename("  ")).toBe("code-graph-call-graph.svg");
  });
});
