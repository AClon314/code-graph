import type { GraphSource, SymbolBundle, SymbolConnection, SymbolNode } from "./types";

export interface CbmHttpOptions {
  /** cbm HTTP base; empty means same-origin (Vite dev proxy). */
  baseUrl?: string;
  /** Project selected in the UI. cbm's HTTP API is project-scoped. */
  project: string;
  fetchImpl?: typeof fetch;
}

interface CbmNode {
  id?: number;
  label?: string;
  name?: string;
  qualified_name?: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  docstring?: string;
  is_entry?: boolean;
  is_test?: boolean;
  is_exported?: boolean;
}

interface CbmConnection extends CbmNode {
  type?: string;
}

interface CbmSymbol {
  node?: CbmNode;
  callers?: { items?: CbmConnection[] };
  callees?: { items?: CbmConnection[] };
}

/**
 * cbm's HTTP API is intentionally thin; the neighborhood loader only needs
 * `/api/symbol`, so this adapter exposes exactly that endpoint.
 */
export class CbmHttpSource implements GraphSource {
  readonly baseUrl: string;
  readonly project: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CbmHttpOptions) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.project = options.project;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async symbol(project: string, ref: string): Promise<SymbolBundle> {
    const params: Record<string, string> = { project };
    if (ref.startsWith("#")) params.id = ref.slice(1);
    else params.qn = ref;
    const json = await this.get<CbmSymbol>("/api/symbol", params);
    if (!json.node) throw new Error(`cbm: symbol not found: ${ref}`);
    return {
      node: mapNode(json.node),
      callers: (json.callers?.items ?? []).map(mapConnection),
      callees: (json.callees?.items ?? []).map(mapConnection),
    };
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const base = this.baseUrl || (typeof location === "undefined" ? "" : location.origin);
    if (!base) throw new Error("CbmHttpSource requires baseUrl outside a browser");
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetchImpl(url.toString(), { headers: { accept: "application/json" } });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`cbm ${path} ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
}

function mapNode(node: CbmNode): SymbolNode {
  return {
    id: node.id,
    label: node.label ?? "Unknown",
    name: node.name ?? "?",
    qualifiedName: node.qualified_name ?? "?",
    filePath: node.file_path,
    startLine: node.start_line,
    endLine: node.end_line,
    docstring: node.docstring,
    isEntry: node.is_entry,
    isTest: node.is_test,
    isExported: node.is_exported,
  };
}

function mapConnection(row: CbmConnection): SymbolConnection {
  return {
    id: row.id,
    type: row.type ?? "CALLS",
    label: row.label ?? "Unknown",
    name: row.name ?? "?",
    qualifiedName: row.qualified_name ?? "?",
    filePath: row.file_path,
    startLine: row.start_line,
  };
}
