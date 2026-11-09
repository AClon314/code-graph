import { describe, expect, test } from "bun:test";

import { resolveIndexOptions } from "../src/cli/lib/indexer.ts";
import { renderGraphSvg } from "../src/lib/graph/svg.ts";
import type { GraphViewData } from "../src/lib/graph/types";

const view: GraphViewData = {
  root: "pkg.main",
  nodes: [
    { id: "pkg.main", label: "Function", name: "main", qualifiedName: "pkg.main" },
    { id: "pkg.helper", label: "Function", name: "helper", qualifiedName: "pkg.helper" },
  ],
  edges: [{ id: "call", source: "pkg.main", target: "pkg.helper", type: "CALLS" }],
  truncated: false,
};

describe("CLI renderers", () => {
  test("SVG contains the graph, labels, and arrow marker", async () => {
    const svg = await renderGraphSvg(view);
    expect(svg).toContain("<svg");
    expect(svg).toContain("pkg.main");
    expect(svg).toContain("pkg.helper");
    expect(svg).toContain("marker-end=\"url(#code-graph-arrow)\"");
    expect(svg).toContain("viewBox=");
  });

  test("SVG escapes XML in symbol names", async () => {
    const escaped: GraphViewData = {
      ...view,
      root: "pkg.a&b",
      nodes: [{ id: "pkg.a&b", label: "Function", name: "a&b", qualifiedName: "pkg.a&b" }],
      edges: [],
    };
    const svg = await renderGraphSvg(escaped);
    expect(svg).toContain("a&amp;b");
    expect(svg).not.toContain(">a&b<");
  });
});

describe("CLI index defaults", () => {
  test("separates cbm and scip project names", () => {
    const options = resolveIndexOptions({
      backend: "both",
      root: "/repo/graph-ui-svelte",
      mode: "fast",
    });
    expect(options.project).toBe("graph-ui-svelte");
    expect(options.scipProject).toBe("graph-ui-svelte-scip");
    expect(options.scipIndexer).toContain("scip-typescript/dist/src/main.js");
  });
});
