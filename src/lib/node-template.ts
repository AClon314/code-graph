import { shortFilePath, shortQualifiedName } from "./graph/node-label";
import type { GraphViewData, GraphViewNode } from "./graph/types";

export const NODE_TEMPLATE_FILE = "slot-node.html";

/**
 * Slot names are dot paths into a small, JSON-safe context. Keeping the
 * template as HTML lets users arrange fields without recompiling Svelte; the
 * file is read by the host and rendered into an SVG foreignObject.
 */
export const NODE_TEMPLATE_SLOT_PATHS = [
  "node.id",
  "node.symbolId",
  "node.name",
  "node.label",
  "node.qualifiedName",
  "node.shortName",
  "node.filePath",
  "node.fileTail",
  "node.startLine",
  "node.startColumn",
  "node.endLine",
  "node.docstring",
  "node.isEntry",
  "node.isTest",
  "node.isExported",
  "graph.root",
  "graph.project",
  "graph.nodeCount",
  "graph.edgeCount",
  "project",
] as const;

export const DEFAULT_FRESH_NODE_TEMPLATE = `/**
 * Fresh / TUI node template.
 *
 * The first line becomes the node label, following lines become the detail
 * block. Add a newline to show more fields; keep lines short for the terminal
 * layout. The web equivalent is slot-node.html.
 */
export interface FreshNodeContext {
  node: {
    id: string;
    name: string;
    label: string;
    qualifiedName: string;
    shortName: string;
    filePath?: string;
    fileTail: string;
    startLine?: number;
    endLine?: number;
    isEntry?: boolean;
    isTest?: boolean;
    isExported?: boolean;
  };
  graph: {
    root: string;
    project: string;
    nodeCount: number;
    edgeCount: number;
  };
  project: string;
}

export default function slotNode({ node }: FreshNodeContext): string {
  return \`\${node.name}\n\${node.filePath ?? node.shortName}:\${node.startLine ?? 1}\`;
}
`;

export const DEFAULT_NODE_TEMPLATE = `<!--
  code-graph node template.

  Edit this file to change how every node is displayed. Slots are dot paths
  into the node context, so nested values work without extra glue:
    node.name · node.shortName · node.label · node.fileTail · graph.project
  Use <slot name="node.name">fallback</slot> for a value; missing values keep
  the fallback. The renderer escapes slot values, so they cannot inject HTML.

  The root must be a rendered element (usually <div>). Do not wrap the
  fragment in <template>: template content is inert and will not be painted
  inside the SVG foreignObject.

  Common paths:
    node.id, node.symbolId, node.name, node.label, node.qualifiedName,
    node.shortName, node.filePath, node.fileTail, node.startLine,
    node.startColumn, node.endLine, node.docstring, node.isEntry,
    node.isTest, node.isExported,
    graph.root, graph.project, graph.nodeCount, graph.edgeCount, project
-->
<div class="node-template">
  <span class="node-template-kind"><slot name="node.label">kind</slot></span>
  <strong class="node-template-name"><slot name="node.name">name</slot></strong>
  <span class="node-template-path"><slot name="node.shortName">…</slot></span>
</div>
`;

export interface NodeTemplateNode extends GraphViewNode {
  shortName: string;
  fileTail: string;
}

export interface NodeTemplateContext {
  node: NodeTemplateNode;
  graph: {
    root: string;
    project: string;
    nodeCount: number;
    edgeCount: number;
  };
  project: string;
}

export function buildNodeTemplateContext(
  node: GraphViewNode,
  data: GraphViewData,
  project: string,
): NodeTemplateContext {
  const effectiveProject = project || data.root.split(".")[0] || "";
  return {
    node: {
      ...node,
      shortName: shortQualifiedName(node.qualifiedName, effectiveProject),
      fileTail: shortFilePath(node.filePath),
    },
    graph: {
      root: data.root,
      project: effectiveProject,
      nodeCount: data.nodes.length,
      edgeCount: data.edges.length,
    },
    project: effectiveProject,
  };
}

/**
 * Fill `<slot name="dot.path">fallback</slot>` entries.
 *
 * A DOM parser would preserve arbitrary nested HTML more faithfully, but the
 * renderer must also work in Bun/TUI-less tests and exported SVG. The slot
 * syntax is deliberately small: a slot may contain fallback text, not nested
 * slots.
 */
export function renderNodeTemplate(
  template: string,
  context: NodeTemplateContext,
): string {
  return template.replace(
    /<slot\s+name\s*=\s*(["'])(.*?)\1\s*(?:\/>|>([\s\S]*?)<\/slot\s*>)/gi,
    (_match, _quote: string, path: string, fallback = "") => {
      const value = valueAtPath(context, path);
      if (value === undefined || value === null || value === "") {
        return fallback;
      }
      return escapeHtml(formatValue(value));
    },
  );
}

function valueAtPath(context: unknown, path: string): unknown {
  let value = context;
  for (const part of path.trim().split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
