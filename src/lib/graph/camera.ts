/** Pure camera math for the D3 graph. Screen coordinates are CSS pixels. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraTransform {
  x: number;
  y: number;
  k: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Visible graph-space rectangle for a screen transform. */
export function viewportBounds(
  transform: CameraTransform,
  viewport: Viewport,
): Rect {
  const k = Math.max(transform.k, Number.EPSILON);
  return {
    x: -transform.x / k,
    y: -transform.y / k,
    width: Math.max(viewport.width, 0) / k,
    height: Math.max(viewport.height, 0) / k,
  };
}

/** True when any part of the node is inside the viewport. */
export function nodeInViewport(
  node: Rect,
  transform: CameraTransform,
  viewport: Viewport,
): boolean {
  const bounds = viewportBounds(transform, viewport);
  return (
    node.x < bounds.x + bounds.width &&
    node.x + node.width > bounds.x &&
    node.y < bounds.y + bounds.height &&
    node.y + node.height > bounds.y
  );
}

/** Bounding rectangle for a set of nodes; null when the set is empty. */
export function boundsForNodes(nodes: readonly Rect[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

/**
 * Fit a graph-space rectangle into a screen viewport. Padding is a fraction of
 * each axis; the returned transform is `screen = graph * k + (x, y)`.
 */
export function fitRect(
  rect: Rect,
  viewport: Viewport,
  padding = 0.06,
  maxScale = 2,
): CameraTransform {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const graphWidth = Math.max(rect.width, 1);
  const graphHeight = Math.max(rect.height, 1);
  const usable = 1 - Math.min(Math.max(padding, 0), 0.4) * 2;
  const scale = Math.min(
    (width / graphWidth) * usable,
    (height / graphHeight) * usable,
    maxScale,
  );
  const k = Math.max(0.08, scale);
  return {
    x: (width - graphWidth * k) / 2 - rect.x * k,
    y: (height - graphHeight * k) / 2 - rect.y * k,
    k,
  };
}

/** Center a node without changing the camera scale. */
export function centerOnNode(node: Rect, viewport: Viewport, scale: number): CameraTransform {
  return {
    x: viewport.width / 2 - (node.x + node.width / 2) * scale,
    y: viewport.height / 2 - (node.y + node.height / 2) * scale,
    k: scale,
  };
}

/** Pan in screen pixels, preserving scale. */
export function panBy(transform: CameraTransform, dx: number, dy: number): CameraTransform {
  return { ...transform, x: transform.x + dx, y: transform.y + dy };
}

/** Zoom around a screen anchor point, preserving the graph point under it. */
export function zoomAt(
  transform: CameraTransform,
  factor: number,
  anchor: { x: number; y: number },
  minScale = 0.08,
  maxScale = 4,
): CameraTransform {
  const k = Math.min(maxScale, Math.max(minScale, transform.k * factor));
  const graphX = (anchor.x - transform.x) / transform.k;
  const graphY = (anchor.y - transform.y) / transform.k;
  return {
    x: anchor.x - graphX * k,
    y: anchor.y - graphY * k,
    k,
  };
}

/**
 * Which endpoint an edge click should reveal. Both visible: no move. Only one
 * visible: the other endpoint. Neither visible: the target (edge direction
 * wins over the source).
 */
export function edgeRevealTarget(
  source: Rect,
  target: Rect,
  transform: CameraTransform,
  viewport: Viewport,
): "source" | "target" | null {
  const sourceVisible = nodeInViewport(source, transform, viewport);
  const targetVisible = nodeInViewport(target, transform, viewport);
  if (sourceVisible && targetVisible) return null;
  if (sourceVisible) return "target";
  if (targetVisible) return "source";
  return "target";
}
