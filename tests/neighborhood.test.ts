import { expect, test } from "bun:test";

import { loadNeighborhood } from "../src/lib/graph/neighborhood";
import { MockSource } from "../src/lib/graph/mock";
import type {
  GraphSource,
  SymbolBundle,
  SymbolConnection,
} from "../src/lib/graph/types";

test("MockSource neighborhood renders root, callers and callees", async () => {
  const data = await loadNeighborhood(
    new MockSource(),
    "demo",
    "demo.src.features.useAlias",
    { depth: 1, direction: "both" },
  );

  expect(data.root).toBe("demo.src.features.useAlias");
  expect(data.nodes.map((node) => node.name).sort()).toEqual([
    "UserRepo",
    "get",
    "main",
    "useAlias",
  ]);
  expect(data.edges.map(edgeKey).sort()).toEqual([
    "demo.src.features.useAlias->demo.src.lib.base.BaseRepo.get:CALLS",
    "demo.src.features.useAlias->demo.src.lib.user-repo.UserRepo:CALLS",
    "demo.src.main.main->demo.src.features.useAlias:CALLS",
  ]);
  expect(data.truncated).toBe(false);
});

test("BFS dedupes edges and follows two hops in both directions", async () => {
  const source = new FakeSource(graph());
  const data = await loadNeighborhood(source, "p", "a", { depth: 2, direction: "both" });

  expect(data.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c", "d"]);
  expect(data.edges.map(edgeKey).sort()).toEqual(
    [
      "b->a:CALLS",
      "a->c:CALLS",
      "b->c:CALLS",
      "c->a:CALLS",
      "c->d:CALLS",
    ].sort(),
  );
  expect(data.truncated).toBe(false);
});

test("depth boundary marks truncated when the last layer has more connections", async () => {
  const source = new FakeSource(graph());
  const data = await loadNeighborhood(source, "p", "a", { depth: 1, direction: "both" });

  expect(data.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
  expect(data.edges.map(edgeKey).sort()).toEqual(["a->c:CALLS", "b->a:CALLS"]);
  expect(data.truncated).toBe(true);
});

test("direction callers only walks incoming edges", async () => {
  const source = new FakeSource(graph());
  const data = await loadNeighborhood(source, "p", "a", { depth: 2, direction: "callers" });

  expect(data.nodes.map((node) => node.id).sort()).toEqual(["a", "b"]);
  expect(data.edges.map(edgeKey)).toEqual(["b->a:CALLS"]);
});

test("maxNodes stops the budget and marks truncated", async () => {
  const source = new FakeSource(graph());
  const data = await loadNeighborhood(source, "p", "a", {
    depth: 2,
    direction: "both",
    maxNodes: 2,
  });

  expect(data.nodes).toHaveLength(2);
  expect(data.nodes.map((node) => node.id).sort()).toEqual(["a", "b"]);
  expect(data.edges.map(edgeKey)).toEqual(["b->a:CALLS"]);
  expect(data.truncated).toBe(true);
});

test("a failed neighbour is skipped without killing the rest of the graph", async () => {
  const source = new FakeSource(
    {
      a: bundle("a", ["bad"], ["c"]),
      c: bundle("c", [], []),
    },
    new Set(["bad"]),
  );

  const data = await loadNeighborhood(source, "p", "a", { depth: 2, direction: "both" });

  expect(data.nodes.map((node) => node.id).sort()).toEqual(["a", "c"]);
  expect(data.nodes.some((node) => node.id === "bad")).toBe(false);
  expect(data.edges.map(edgeKey)).toEqual(["a->c:CALLS"]);
});

test("a failed root rejects with a useful message", async () => {
  const source = new FakeSource({});
  await expect(loadNeighborhood(source, "project-x", "missing.root")).rejects.toThrow(
    /failed to load root symbol "missing.root" in project "project-x"/i,
  );
});

test("recursive connections become self edges", async () => {
  const source = new FakeSource({ a: bundle("a", ["a"], ["a"]) });
  const data = await loadNeighborhood(source, "p", "a", { depth: 2, direction: "both" });

  expect(data.nodes.map((node) => node.id)).toEqual(["a"]);
  expect(data.edges.map(edgeKey)).toEqual(["a->a:CALLS"]);
  expect(data.truncated).toBe(false);
});

function graph(): Record<string, SymbolBundle> {
  return {
    a: bundle("a", ["b"], ["c"]),
    b: bundle("b", [], ["a", "c"]),
    c: bundle("c", ["a", "b"], ["a", "d"]),
    d: bundle("d", ["c"], []),
  };
}

function bundle(
  name: string,
  callers: string[],
  callees: string[],
): SymbolBundle {
  return {
    node: {
      id: name.charCodeAt(0),
      label: "Function",
      name,
      qualifiedName: name,
      filePath: `src/${name}.ts`,
      startLine: 1,
    },
    callers: callers.map(connection),
    callees: callees.map(connection),
  };
}

function connection(name: string): SymbolConnection {
  return {
    id: name.charCodeAt(0),
    type: "CALLS",
    label: "Function",
    name,
    qualifiedName: name,
    filePath: `src/${name}.ts`,
    startLine: 1,
  };
}

function edgeKey(edge: { source: string; target: string; type: string }): string {
  return `${edge.source}->${edge.target}:${edge.type}`;
}

class FakeSource implements GraphSource {
  readonly calls: string[] = [];
  private readonly bundles: Record<string, SymbolBundle>;
  private readonly failures: Set<string>;

  constructor(bundles: Record<string, SymbolBundle>, failures = new Set<string>()) {
    this.bundles = bundles;
    this.failures = failures;
  }

  async symbol(_project: string, ref: string): Promise<SymbolBundle> {
    this.calls.push(ref);
    if (this.failures.has(ref)) throw new Error(`boom: ${ref}`);
    const found = this.bundles[ref];
    if (!found) throw new Error(`not found: ${ref}`);
    return structuredClone(found);
  }
}
