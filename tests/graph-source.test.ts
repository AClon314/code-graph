import { expect, test } from "bun:test";

import { CbmHttpSource } from "../src/lib/graph/cbm-http";
import { MockSource } from "../src/lib/graph/mock";

test("MockSource returns a symbol bundle", async () => {
  const source = new MockSource();

  const bundle = await source.symbol("demo", "demo.src.features.useAlias");
  expect(bundle.node.name).toBe("useAlias");
  expect(bundle.callees.map((callee) => callee.name)).toContain("get");

  await expect(source.symbol("demo", "missing")).rejects.toThrow("mock symbol not found");
});

test("CbmHttpSource maps the symbol payload and URL", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname === "/api/symbol") {
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
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const source = new CbmHttpSource({ baseUrl: "http://cbm.test", project: "p", fetchImpl: fakeFetch });
  const bundle = await source.symbol("p", "p.src.features.useAlias");

  expect(bundle.node).toMatchObject({
    id: 1,
    name: "useAlias",
    qualifiedName: "p.src.features.useAlias",
    filePath: "src/features.ts",
    startLine: 5,
  });
  expect(bundle.callers).toEqual([]);
  expect(bundle.callees[0]).toMatchObject({
    id: 2,
    type: "CALLS",
    name: "get",
    qualifiedName: "p.src.base.get",
  });
  expect(calls).toEqual(["/api/symbol?project=p&qn=p.src.features.useAlias"]);
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
