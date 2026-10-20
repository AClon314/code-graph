import { expect, test } from "bun:test";

import { CbmHttpSource } from "../src/lib/graph/cbm-http";
import { MockSource } from "../src/lib/graph/mock";

test("MockSource satisfies the GraphSource contract", async () => {
  const source = new MockSource();
  expect(await source.projects()).toHaveLength(1);

  const tree = await source.tree("demo");
  expect(tree.some((entry) => entry.kind === "dir")).toBe(true);

  const bundle = await source.symbol("demo", "demo.src.features.useAlias");
  expect(bundle.node.name).toBe("useAlias");
  expect(bundle.callees.map((callee) => callee.name)).toContain("get");

  const trace = await source.trace("demo", "a", "b");
  expect(trace.path.length).toBeGreaterThan(1);

  const impact = await source.impact("demo", "demo.src.features.useAlias");
  expect(impact.nodes.length).toBeGreaterThan(0);

  const slice = await source.source("demo", "src/features.ts", 1, 3);
  expect(slice.firstLine).toBe(1);
  expect(slice.source.split("\n")).toHaveLength(3);

  expect((await source.search("demo", "alias")).length).toBeGreaterThan(0);
});

test("CbmHttpSource maps tree, symbol, trace and impact payloads", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const path = url.pathname;
    if (path === "/api/tree") {
      return json({
        path: "src",
        children: [{ name: "features.ts", path: "src/features.ts", kind: "file", symbols: 4 }],
      });
    }
    if (path === "/api/symbol") {
      return json({
        node: {
          id: 1,
          label: "Function",
          name: "useAlias",
          qualified_name: "p.src.features.useAlias",
          file_path: "src/features.ts",
          start_line: 5,
        },
        callers: { items: [] },
        callees: {
          items: [
            {
              id: 2,
              type: "CALLS",
              label: "Method",
              name: "get",
              qualified_name: "p.src.base.get",
              file_path: "src/base.ts",
              start_line: 4,
            },
          ],
        },
      });
    }
    if (path === "/api/trace") {
      return json({ mode: "calls", path: [{ id: 1, name: "a", file_path: "a.ts" }, { id: 2, name: "b" }] });
    }
    if (path === "/api/impact") {
      return json({ node: { id: 1, name: "a" }, nearest: [{ id: 2, name: "b", distance: 1 }] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const source = new CbmHttpSource({ baseUrl: "http://cbm.test", project: "p", fetchImpl: fakeFetch });
  const tree = await source.tree("p", "src");
  expect(tree[0]).toMatchObject({ name: "features.ts", kind: "file", symbols: 4 });

  const bundle = await source.symbol("p", "p.src.features.useAlias");
  expect(bundle.node.qualifiedName).toBe("p.src.features.useAlias");
  expect(bundle.callees[0]?.name).toBe("get");

  const trace = await source.trace("p", "a", "b");
  expect(trace.path.map((hop) => hop.name)).toEqual(["a", "b"]);

  const impact = await source.impact("p", "p.src.features.useAlias");
  expect(impact.nodes.map((node) => node.name)).toEqual(["a", "b"]);

  await expect(source.source("p", "a.ts")).rejects.toThrow("/api/source");
  expect(calls.some((call) => call.includes("qn=p.src.features.useAlias"))).toBe(true);
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
