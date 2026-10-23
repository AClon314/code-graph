import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { RUNNING_FRAMES } from "../src/lib/graph/orchgraph";
import { buildTerminalCanvas } from "../src/lib/graph/terminal";
import type { GraphViewData } from "../src/lib/graph/types";

const fixture = JSON.parse(
  readFileSync(new URL("../tui/fixture-graph.json", import.meta.url), "utf8"),
) as GraphViewData;

test("terminal canvas renders orchgraph box-drawing character art", async () => {
  const canvas = await buildTerminalCanvas(fixture);

  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
  expect(canvas.nodes).toHaveLength(fixture.nodes.length);
  expect(canvas.edges.length).toBeGreaterThan(0);

  const art = canvas.lines.join("\n");
  expect(art).toContain("╭");
  expect(art).toContain("╰");
  expect(art).toContain("▼");
  expect(art).toContain(RUNNING_FRAMES[0]);
  expect(art).not.toContain("◐");
  expect(art).not.toContain("●");
  expect(art).not.toContain("\u001b[");
});

test("terminal canvas keeps node boxes inside the canvas", async () => {
  const canvas = await buildTerminalCanvas(fixture);

  for (const node of canvas.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x + node.width).toBeLessThanOrEqual(canvas.width);
    expect(node.y + node.height).toBeLessThanOrEqual(canvas.height);
  }
});
