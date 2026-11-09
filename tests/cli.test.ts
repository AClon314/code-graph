import { describe, expect, test } from "bun:test";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveIndexOptions } from "../src/cli/lib/indexer.ts";
import { renderResolved } from "../src/cli/lib/output.ts";
import { renderGraph } from "../src/cli/lib/render.ts";
import { readGraphFile } from "../src/lib/graph/load.ts";
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

describe("CLI graph loading", () => {
  test("reads the deterministic TUI fixture", () => {
    const view = readGraphFile("tui/fixture-graph.json");
    expect(view.nodes.length).toBeGreaterThan(0);
    expect(view.root).toBe("demo.src.features.useAlias");
  });
});

describe("CLI output paths", () => {
  test("both formats use .svg and .txt suffixes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "code-graph-cli-"));
    try {
      const view = readGraphFile("tui/fixture-graph.json");
      const files = await renderGraph(view, {
        format: "both",
        out: join(dir, "code-graph.demo"),
      });
      expect(files.svg).toBe(join(dir, "code-graph.demo.svg"));
      expect(files.orchgraph).toBe(join(dir, "code-graph.demo.txt"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stream mode returns stdout and writes no files", async () => {
    const result = await renderResolved({
      root: process.cwd(),
      backend: "cbm",
      graph: "tui/fixture-graph.json",
      depth: 2,
      direction: "both",
      maxNodes: 60,
      format: "orchgraph",
      out: "/tmp/should-not-be-written",
      stream: true,
      layoutDirection: "DOWN",
      spacing: 3,
      maxNodeWidth: 32,
    });
    expect(result.files).toEqual([]);
    expect(result.stdout).toContain("main");
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
