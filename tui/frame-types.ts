/** Frame JSON types consumed by the Fresh plugin (sandbox has no imports). */
export interface Run {
  t: string;
  fg?: string;
  bold?: boolean;
}

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeMeta {
  label: string;
  kind: string;
  file: string;
  line: number;
  qn?: string;
}

export interface Frame {
  width: number;
  height: number;
  nodeCount: number;
  lines: Run[][];
  nodes?: NodeBox[];
  meta?: Record<string, NodeMeta>;
}
