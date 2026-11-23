import { describe, expect, test } from "bun:test";

import { buildAiContext } from "../src/lib/ai-context";
import type { GraphViewNode, SymbolBundle } from "../src/lib/graph/types";

const cwd = "/home/me/gpen-js";

const bundle: SymbolBundle = {
  node: {
    label: "Method",
    name: "myStaticMethod",
    qualifiedName: "demo.src.lib.MyComponent.MyClass.myStaticMethod",
    filePath: "src/lib/MyComponent.svelte",
    startLine: 2,
    startColumn: 30,
  },
  callers: [
    {
      type: "CALLS",
      label: "Function",
      name: "myFunc",
      qualifiedName: "demo.src.main.myFunc",
      filePath: "src/main.ts",
      startLine: 3,
      startColumn: 20,
    },
  ],
  callees: [],
};

describe("forAI context", () => {
  test("renders Markdown headings, location and compact links", () => {
    const context = buildAiContext(bundle, null, cwd);
    expect(context).not.toBeNull();
    expect(context?.markdown).toContain("# gpen-js/");
    expect(context?.markdown).toContain("## src/lib/MyComponent.svelte");
    expect(context?.markdown).toContain("### \\#MyClass.myStaticMethod");
    expect(context?.markdown).toContain("src/lib/MyComponent.svelte#L2C30");
    expect(context?.markdown).toContain(
      "- [src/main.ts#myFunc](src/main.ts#L3C20)",
    );
    expect(context?.markdown).toContain("#### Callees");
    expect(context?.markdown).toContain("- none");
  });

  test("renders JSON keyed by compact global paths", () => {
    const context = buildAiContext(bundle, null, cwd);
    const json = context?.json;
    expect(json?.self).toBe("gpen-js//src/lib/MyComponent.svelte#MyClass.myStaticMethod");
    expect(json?.location).toBe("src/lib/MyComponent.svelte#L2C30");
    expect(json?.callers["gpen-js//src/main.ts#myFunc"]).toEqual({
      label: "myFunc",
      file: "src/main.ts",
      line: 3,
      column: 20,
      symbolPath: "gpen-js//src/main.ts#myFunc",
      location: "src/main.ts#L3C20",
    });
  });

  test("includes the project field in path identity", () => {
    const context = buildAiContext(bundle, null, cwd, "demo");
    expect(context?.path.project).toBe("demo");
    expect(context?.json.self).toBe("demo//src/lib/MyComponent.svelte#MyClass.myStaticMethod");
    expect(context?.markdown).toContain("# demo/");
  });

  test("uses the selected graph node when no bundle is loaded", () => {
    const node: GraphViewNode = {
      id: "demo.src.main.main",
      label: "Function",
      name: "main",
      qualifiedName: "demo.src.main.main",
      filePath: "src/main.ts",
      startLine: 3,
    };
    const context = buildAiContext(null, node, cwd);
    expect(context?.path.toDisplay()).toBe("gpen-js//src/main.ts#main");
    expect(context?.markdown).toContain("## src/main.ts");
    expect(context?.json.callers).toEqual({});
  });
});
