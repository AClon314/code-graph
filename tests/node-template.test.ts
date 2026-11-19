import { describe, expect, test } from "bun:test";

import {
  DEFAULT_FRESH_NODE_TEMPLATE,
  DEFAULT_NODE_TEMPLATE,
  buildNodeTemplateContext,
  renderNodeTemplate,
} from "../src/lib/node-template";
import { shortQualifiedName } from "../src/lib/graph/node-label";
import type { GraphViewData } from "../src/lib/graph/types";

const data: GraphViewData = {
  root: "graph-ui-svelte-scip.src.main",
  nodes: [],
  edges: [],
  truncated: false,
};
const node = {
  id: "graph-ui-svelte-scip.src.utils.date.format",
  label: "Function",
  name: "format",
  qualifiedName: "graph-ui-svelte-scip.src.utils.date.format",
  filePath: "/repo/src/utils/date.ts",
  startLine: 12,
};

describe("node labels and slots", () => {
  test("drops the repeated project prefix and keeps the tail", () => {
    expect(shortQualifiedName(node.qualifiedName, "graph-ui-svelte-scip")).toBe(
      "src.utils.date.format",
    );
    expect(shortQualifiedName("demo.src.main", "demo")).toBe("src.main");
    expect(shortQualifiedName("demo.src.main", "other")).toBe("demo.src.main");
  });

  test("renders dot-path slots, fallbacks, and escaped values", () => {
    const context = buildNodeTemplateContext(node, data, "graph-ui-svelte-scip");
    const html = renderNodeTemplate(
      `<b><slot name="node.name">?</slot></b><i><slot name="node.shortName"></slot></i><u><slot name="node.missing">fallback</slot></u>`,
      context,
    );
    expect(html).toContain("<b>format</b>");
    expect(html).toContain("<i>src.utils.date.format</i>");
    expect(html).toContain("<u>fallback</u>");
    expect(renderNodeTemplate(`<slot name="node.name"></slot>`, context)).toBe("format");
  });

  test("ships an editable template with documented paths", () => {
    expect(DEFAULT_NODE_TEMPLATE).toContain("node.shortName");
    expect(DEFAULT_NODE_TEMPLATE).toContain("graph.project");
    expect(DEFAULT_NODE_TEMPLATE).toContain("<slot name=\"node.name\">");
    expect(DEFAULT_FRESH_NODE_TEMPLATE).toContain("export default function");
    expect(DEFAULT_FRESH_NODE_TEMPLATE).toContain("node.shortName");
  });
});
