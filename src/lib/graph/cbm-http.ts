import type {
  GraphEdge,
  GraphSource,
  ImpactNode,
  ImpactResult,
  Project,
  SearchHit,
  SourceSlice,
  SymbolBundle,
  SymbolConnection,
  SymbolNode,
  TraceHop,
  TraceResult,
  TreeEntry,
} from "./types";

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

interface CbmTreeChild {
  name: string;
  path: string;
  kind: "dir" | "file";
  symbols?: number;
  files?: number;
  missed?: number;
}

interface CbmTree {
  path?: string;
  children?: CbmTreeChild[];
}

interface CbmSymbol {
  node?: CbmNode;
  callers?: { items?: CbmConnection[] };
  callees?: { items?: CbmConnection[] };
}

interface CbmTrace {
  mode?: string;
  path?: Array<{ id?: number; name?: string; qualified_name?: string; file_path?: string; start_line?: number }>;
  reachable?: boolean;
  error?: string;
}

interface CbmImpact {
  node?: { id?: number; name?: string; file_path?: string };
  nearest?: Array<{ id?: number; name?: string; file_path?: string; distance?: number }>;
  tests_nearest?: Array<{ id?: number; name?: string; file_path?: string; distance?: number }>;
  error?: string;
}

/**
 * cbm's HTTP API is intentionally thin (tree / symbol / trace / impact).
 * Source slices and full-text search arrive in A2/B2; those methods fail loud
 * instead of pretending the data exists.
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

  async projects(): Promise<Project[]> {
    // cbm 0.12.1 has no /api/projects; the UI is launched with a project.
    return [{ name: this.project }];
  }

  async tree(project: string, path = ""): Promise<TreeEntry[]> {
    const json = await this.get<CbmTree>("/api/tree", { project, path });
    const entries: TreeEntry[] = (json.children ?? []).map((child) => ({
      name: child.name,
      path: child.path,
      kind: child.kind,
      symbols: child.symbols,
      files: child.files,
      missed: child.missed,
    }));
    // cbm groups by nodes.file_path, so a Folder node also appears as a
    // same-named "file" at its parent level. A directory wins.
    const byPath = new Map<string, TreeEntry>();
    for (const entry of entries) {
      const previous = byPath.get(entry.path);
      if (!previous || (previous.kind === "file" && entry.kind === "dir")) {
        byPath.set(entry.path, entry);
      }
    }
    return [...byPath.values()];
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

  async trace(
    project: string,
    from: string,
    to: string,
    mode: "calls" | "data" = "calls"
  ): Promise<TraceResult> {
    const json = await this.get<CbmTrace>("/api/trace", {
      project,
      from,
      to,
      mode,
    });
    if (json.error) throw new Error(`cbm trace: ${json.error}`);
    return {
      from,
      to,
      mode: json.mode ?? mode,
      path: (json.path ?? []).map(
        (hop): TraceHop => ({
          id: hop.id,
          name: hop.name ?? "?",
          qualifiedName: hop.qualified_name ?? (hop.id !== undefined ? `#${hop.id}` : "?"),
          filePath: hop.file_path,
          startLine: hop.start_line,
        })
      ),
    };
  }

  async impact(project: string, node: string): Promise<ImpactResult> {
    const json = await this.get<CbmImpact>("/api/impact", { project, node });
    if (json.error) throw new Error(`cbm impact: ${json.error}`);
    const nodes: ImpactNode[] = [];
    if (json.node) nodes.push({ ...mapImpactNode(json.node), hop: 0 });
    for (const row of [...(json.nearest ?? []), ...(json.tests_nearest ?? [])]) {
      nodes.push({ ...mapImpactNode(row), hop: row.distance ?? 1 });
    }
    const edges: GraphEdge[] = [];
    return { root: node, nodes, edges, raw: json };
  }

  async source(_project: string, _path: string, _start?: number, _end?: number): Promise<SourceSlice> {
    throw new Error("cbm 0.12.1 has no /api/source; add A2 or use MCP get_code_snippet");
  }

  async search(_project: string, _query: string, _limit = 20): Promise<SearchHit[]> {
    throw new Error("cbm 0.12.1 has no /api/search; use mock or add A2");
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

function mapImpactNode(row: {
  id?: number;
  name?: string;
  file_path?: string;
  distance?: number;
}): ImpactNode {
  return {
    id: row.id,
    name: row.name ?? "?",
    qualifiedName: row.name ?? "?",
    filePath: row.file_path,
    hop: row.distance,
  };
}
