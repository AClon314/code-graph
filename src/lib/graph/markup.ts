/** Shared SVG/HTML token helpers used by the live view and DOM-free export. */

export function kindClass(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function pointList(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
