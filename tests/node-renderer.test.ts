import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
  DEFAULT_NODE_RENDERER,
  NODE_RENDERER_FILE,
  buildNodeRenderContext,
} from "../src/lib/node-renderer";
import type { GraphViewData } from "../src/lib/graph/types";

const data: GraphViewData = {
  root: "demo.src.main",
  nodes: [
    {
      id: "demo.src.main",
      name: "main",
      label: "Function",
      qualifiedName: "demo.src.main",
      filePath: "src/main.ts",
      startLine: 3,
      isEntry: true,
    },
  ],
  edges: [],
  truncated: false,
};

describe("node renderer context", () => {
  test("adds short names and graph metadata without losing node fields", () => {
    const context = buildNodeRenderContext(data.nodes[0]!, data, "demo");
    expect(context.node.shortName).toBe("src.main");
    expect(context.node.fileTail).toBe("src/main.ts");
    expect(context.node.isEntry).toBe(true);
    expect(context.graph).toEqual({
      root: "demo.src.main",
      project: "demo",
      nodeCount: 1,
      edgeCount: 0,
    });
  });

  test("runs both exported functions from the workspace module", async () => {
    const module = (await import(`../${NODE_RENDERER_FILE}?test=${Date.now()}`)) as {
      renderNodeHtml: (context: ReturnType<typeof buildNodeRenderContext>) => string;
      renderNodeText: (context: ReturnType<typeof buildNodeRenderContext>) => string;
    };
    const context = buildNodeRenderContext(data.nodes[0]!, data, "demo");
    expect(module.renderNodeHtml(context)).toContain("node-card");
    expect(module.renderNodeText(context)).toBe("main\nsrc/main.ts:3");
  });

  test("ships the same render source in the workspace file", () => {
    const actual = readFileSync(
      new URL(`../${NODE_RENDERER_FILE}`, import.meta.url),
      "utf8",
    );
    expect(actual).toBe(DEFAULT_NODE_RENDERER);
    expect(actual).toContain("export function renderNodeHtml");
    expect(actual).toContain("export function renderNodeText");
    expect(actual).toContain("@typedef {Object} NodeRenderContext");
  });
});
