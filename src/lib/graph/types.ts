/**
 * GraphSource is the only contract the UI knows about.
 *
 * `CbmHttpSource` adapts codebase-memory-mcp's HTTP API; `MockSource` keeps the
 * shell testable without a running daemon. Keep this file free of Svelte and
 * CodeMirror imports so editors/LSP clients can share the same types later.
 *
 * The GUI/TUI neighborhood loader only needs `symbol()`, so this interface
 * deliberately exposes no other endpoints.
 */

export interface SymbolNode {
  id?: number;
  label: string;
  name: string;
  qualifiedName: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  docstring?: string;
  isEntry?: boolean;
  isTest?: boolean;
  isExported?: boolean;
}

export interface SymbolConnection {
  id?: number;
  type: string;
  label: string;
  name: string;
  qualifiedName: string;
  filePath?: string;
  startLine?: number;
}

export interface SymbolBundle {
  node: SymbolNode;
  callers: SymbolConnection[];
  callees: SymbolConnection[];
}

export interface GraphSource {
  symbol(project: string, ref: string): Promise<SymbolBundle>;
}

export interface GraphViewNode extends Omit<SymbolNode, "id"> {
  /** Stable graph id; normally the qualified name. */
  id: string;
  /** cbm numeric node id, when available. */
  symbolId?: number;
}

export interface GraphViewEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

/** Local call graph rendered by the GUI and the TUI frame generator. */
export interface GraphViewData {
  root: string;
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  /** True when a depth/node budget stopped BFS early. */
  truncated: boolean;
}
