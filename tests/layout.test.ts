import { expect, test } from "bun:test";

import { layoutGraphView, NODE_HEIGHT, NODE_WIDTH } from "../src/lib/graph/layout";
import type { GraphViewData } from "../src/lib/graph/types";

const DATA: GraphViewData = {
  root: "a",
  truncated: false,
  nodes: [
    { id: "a", label: "Function", name: "a", qualifiedName: "a" },
    { id: "b", label: "Method", name: "b", qualifiedName: "b" },
  ],
  edges: [
    { id: "call", source: "a", target: "b", type: "CALLS" },
    { id: "self", source: "a", target: "a", type: "CALLS" },
    { id: "missing", source: "a", target: "gone", type: "CALLS" },
  ],
};

test("layoutGraphView produces ELK geometry with a visible self loop", async () => {
  const layout = await layoutGraphView(DATA);

  expect(layout.nodes).toHaveLength(2);
  expect(layout.nodes.every((node) => node.width === NODE_WIDTH && node.height === NODE_HEIGHT)).toBe(
    true,
  );
  expect(layout.edges).toHaveLength(2);

  const call = layout.edges.find((edge) => edge.id === "call");
  expect(call?.points.length).toBeGreaterThanOrEqual(2);

  const loop = layout.edges.find((edge) => edge.id === "self");
  expect(loop?.points.length).toBeGreaterThanOrEqual(3);
  const node = layout.nodes.find((candidate) => candidate.id === "a")!;
  expect(Math.max(...loop!.points.map((point) => point.x))).toBeGreaterThan(node.x + node.width);

  expect(layout.width).toBeGreaterThan(0);
  expect(layout.height).toBeGreaterThan(0);
  for (const point of layout.edges.flatMap((edge) => edge.points)) {
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeGreaterThanOrEqual(0);
  }
});

test("layoutGraphView is deterministic and supports RIGHT", async () => {
  const first = await layoutGraphView(DATA, "DOWN");
  const second = await layoutGraphView(DATA, "DOWN");
  expect(second).toEqual(first);

  const right = await layoutGraphView(DATA, "RIGHT");
  const a = right.nodes.find((node) => node.id === "a")!;
  const b = right.nodes.find((node) => node.id === "b")!;
  expect(a.x).not.toBe(b.x);
});

test("layoutGraphView handles empty and disconnected graphs", async () => {
  const empty = await layoutGraphView({
    root: "empty",
    truncated: false,
    nodes: [],
    edges: [],
  });
  expect(empty.nodes).toEqual([]);
  expect(empty.width).toBeGreaterThan(0);

  const disconnected = await layoutGraphView({
    root: "a",
    truncated: false,
    nodes: [
      { id: "a", label: "Function", name: "a", qualifiedName: "a" },
      { id: "b", label: "Function", name: "b", qualifiedName: "b" },
    ],
    edges: [],
  });
  expect(disconnected.nodes).toHaveLength(2);
  expect(disconnected.edges).toEqual([]);
});
