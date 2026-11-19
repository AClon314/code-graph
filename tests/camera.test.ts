import { expect, test } from "bun:test";

import {
  boundsForNodes,
  centerOnNode,
  edgeRevealTarget,
  fitRect,
  nodeInViewport,
  panBy,
  viewportBounds,
  zoomAt,
} from "../src/lib/graph/camera";

test("camera helpers convert between graph and screen space", () => {
  const transform = { x: 20, y: 10, k: 2 };
  expect(viewportBounds(transform, { width: 200, height: 100 })).toEqual({
    x: -10,
    y: -5,
    width: 100,
    height: 50,
  });
  const node = { x: 0, y: 0, width: 20, height: 10 };
  expect(nodeInViewport(node, transform, { width: 200, height: 100 })).toBe(true);
  expect(nodeInViewport({ ...node, x: 100 }, transform, { width: 200, height: 100 })).toBe(false);
});

test("camera helpers fit, center and pan without surprises", () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };
  const fitted = fitRect(rect, { width: 200, height: 100 }, 0);
  expect(fitted.k).toBe(2);
  expect(fitted.x).toBe(-20);
  expect(fitted.y).toBe(-40);
  expect(boundsForNodes([rect, { x: 30, y: 0, width: 10, height: 10 }])).toEqual({
    x: 10,
    y: 0,
    width: 100,
    height: 70,
  });
  expect(centerOnNode(rect, { width: 200, height: 100 }, 2)).toEqual({
    x: -20,
    y: -40,
    k: 2,
  });
  expect(panBy({ x: 1, y: 2, k: 1 }, 10, -5)).toEqual({ x: 11, y: -3, k: 1 });
  expect(zoomAt({ x: 0, y: 0, k: 1 }, 2, { x: 50, y: 50 })).toEqual({
    x: -50,
    y: -50,
    k: 2,
  });
});

test("edge clicks reveal the missing endpoint, or nothing when both are visible", () => {
  const viewport = { width: 200, height: 100 };
  const visible = { x: 0, y: 0, width: 20, height: 10 };
  const alsoVisible = { x: 40, y: 20, width: 20, height: 10 };
  const outside = { x: 500, y: 0, width: 20, height: 10 };
  const transform = { x: 20, y: 10, k: 2 };
  expect(edgeRevealTarget(visible, alsoVisible, transform, viewport)).toBeNull();
  expect(edgeRevealTarget(visible, outside, transform, viewport)).toBe("target");
  expect(edgeRevealTarget(outside, visible, transform, viewport)).toBe("source");
  expect(edgeRevealTarget(outside, { ...outside, x: 800 }, transform, viewport)).toBe("target");
});
