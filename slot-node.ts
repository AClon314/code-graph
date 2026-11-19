/**
 * Fresh / TUI node template.
 *
 * Fresh has no HTML renderer; this file is imported by tui/render.ts and its
 * default function returns plain text. The first line becomes the node label,
 * following lines become the detail block. Keep lines short: the terminal
 * layout measures them in display cells.
 *
 * Type hints are local to this file, so the template has no runtime or package
 * dependency. The web equivalent is slot-node.html.
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
  return `${node.name}\n${node.filePath ?? node.shortName}:${node.startLine ?? 1}`;
}
