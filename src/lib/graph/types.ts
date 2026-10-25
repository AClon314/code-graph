/**
 * GraphSource is the only contract the UI knows about.
 *
 * `CbmHttpSource` adapts codebase-memory-mcp's HTTP API; `MockSource` keeps the
 * shell testable without a running daemon. Keep this file free of Svelte and
 * CodeMirror imports so editors/LSP clients can share the same types later.
 */

export interface Project {
  name: string;
  rootPath?: string;
  indexedAt?: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  kind: "dir" | "file";
  symbols?: number;
  files?: number;
  missed?: number;
}

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

export interface TraceHop {
  id?: number;
  label?: string;
  name: string;
  qualifiedName: string;
  filePath?: string;
  startLine?: number;
}

export interface TraceResult {
  from: string;
  to: string;
  mode: string;
  path: TraceHop[];
}

export interface ImpactNode {
  id?: number;
  label?: string;
  name: string;
  qualifiedName: string;
  filePath?: string;
  startLine?: number;
  hop?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface ImpactResult {
  root: string;
  nodes: ImpactNode[];
  edges: GraphEdge[];
  raw?: unknown;
}

export interface SourceSlice {
  path: string;
  source: string;
  firstLine: number;
  lastLine: number;
  truncated: boolean;
}

export interface SearchHit {
  label: string;
  name: string;
  qualifiedName: string;
  filePath?: string;
  startLine?: number;
}

export interface GraphSource {
  projects(): Promise<Project[]>;
  tree(project: string, path?: string): Promise<TreeEntry[]>;
  symbol(project: string, ref: string): Promise<SymbolBundle>;
  trace(
    project: string,
    from: string,
    to: string,
    mode?: "calls" | "data"
  ): Promise<TraceResult>;
  impact(project: string, node: string): Promise<ImpactResult>;
  source(project: string, path: string, start?: number, end?: number): Promise<SourceSlice>;
  search(project: string, query: string, limit?: number): Promise<SearchHit[]>;
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
