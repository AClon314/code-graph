import { layoutGraphView, type GraphLayout, type LayoutDirection } from "./layout";
import type { GraphViewData } from "./types";

export interface SvgOptions {
  direction?: LayoutDirection;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function kindClass(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function pointList(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

const STYLE = `
:root { --bg: #ffffff; --graph-bg: #ffffff; --node-bg: #ffffff; --node-line: #999999; --edge: #888888; --text: #111111; --muted: #666666; --font-code: ui-monospace, monospace; }
.graph-svg { background: var(--graph-bg); }
.orchgraph-edge { fill: none; stroke: var(--edge); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.orchgraph-arrow { fill: var(--edge); }
.orchgraph-node rect { fill: var(--node-bg); stroke: var(--node-line); stroke-width: 1.25; }
.orchgraph-node-kind { fill: var(--muted); font: 600 9px var(--font-code); letter-spacing: .04em; text-transform: uppercase; }
.orchgraph-node-label { fill: var(--text); font: 600 14px var(--font-code); }
.orchgraph-node-detail { fill: var(--muted); font: 10px var(--font-code); }
`.trim();

/** Render the same graph view as GraphView.svelte without a DOM. */
export async function renderGraphSvg(
  data: GraphViewData,
  options: SvgOptions = {},
): Promise<string> {
  const layout: GraphLayout = await layoutGraphView(data, options.direction ?? "DOWN");
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const width = Math.max(Math.ceil(layout.width), 1);
  const height = Math.max(Math.ceil(layout.height), 1);
  const markerId = "code-graph-arrow";

  const clips = layout.nodes
    .map(
      (node, index) =>
        `<clipPath id="code-graph-clip-${index}"><rect x="${node.x + 9}" y="${node.y}" width="${Math.max(node.width - 18, 1)}" height="${node.height}"/></clipPath>`,
    )
    .join("\n");

  const edges = layout.edges
    .map(
      (edge) =>
        `<polyline class="orchgraph-edge" data-edge-id="${escapeXml(edge.id)}" data-source="${escapeXml(edge.source)}" data-target="${escapeXml(edge.target)}" points="${pointList(edge.points)}" marker-end="url(#${markerId})"/>`,
    )
    .join("\n");

  const nodes = layout.nodes
    .map((positioned, index) => {
      const node = nodeById.get(positioned.id);
      if (!node) return "";
      const kind = kindClass(node.label);
      return `<g class="orchgraph-node kind-${kind}" data-node-id="${escapeXml(node.id)}" data-kind="${escapeXml(node.label)}" role="button" aria-label="${escapeXml(`${node.name}, ${node.label}, ${node.qualifiedName}`)}">
<title>${escapeXml(`${node.name} — ${node.qualifiedName}`)}</title>
<rect x="${positioned.x}" y="${positioned.y}" width="${positioned.width}" height="${positioned.height}" rx="10"/>
<text class="orchgraph-node-kind" x="${positioned.x + positioned.width - 10}" y="${positioned.y + 17}" text-anchor="end">${escapeXml(node.label)}</text>
<g clip-path="url(#code-graph-clip-${index})">
<text class="orchgraph-node-label" x="${positioned.x + 12}" y="${positioned.y + 33}">${escapeXml(node.name)}</text>
<text class="orchgraph-node-detail" x="${positioned.x + 12}" y="${positioned.y + 51}">${escapeXml(node.qualifiedName)}</text>
</g>
</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" class="graph-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(`Call graph for ${data.root}: ${data.nodes.length} nodes, ${data.edges.length} edges`)}">
<title>${escapeXml(`Call graph for ${data.root}`)}</title>
<defs>
<style>${STYLE}</style>
<marker id="${markerId}" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path class="orchgraph-arrow" d="M0,0 L11,5.5 L0,11 z"/></marker>
${clips}
</defs>
<g class="graph-viewport">
<g class="orchgraph-edges">
${edges}
</g>
<g class="orchgraph-nodes">
${nodes}
</g>
</g>
</svg>
`;
}
