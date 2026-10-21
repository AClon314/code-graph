import type {
  GraphSource,
  GraphViewData,
  GraphViewEdge,
  GraphViewNode,
  SymbolBundle,
  SymbolConnection,
} from "./types";

export type NeighborhoodDirection = "both" | "callers" | "callees";

export interface NeighborhoodOptions {
  depth?: 1 | 2 | 3;
  direction?: NeighborhoodDirection;
  maxNodes?: number;
}

interface LoadedRecord {
  /** Actual graph id (normally the bundle's qualified name). */
  id: string;
  /** Reference used to fetch the record (`qn` or `#id`). */
  ref: string;
  depth: number;
  bundle: SymbolBundle;
}

interface ConnectionEntry {
  connection: SymbolConnection;
  side: "caller" | "callee";
}

const DEFAULT_DEPTH = 2;
const DEFAULT_MAX_NODES = 200;

/**
 * Breadth-first local call graph around `root`.
 *
 * Only `GraphSource.symbol` is used: cbm's impact/trace endpoints don't expose
 * the caller/callee direction consistently, and the GUI needs both directions
 * for its 1–3 hop navigator.
 *
 * A failed root is fatal (otherwise the UI has nothing to render). A failed
 * neighbour is skipped; the rest of the BFS keeps going. `truncated` is set
 * when the node budget, or the depth boundary, prevents us from following a
 * connection that we know exists.
 */
export async function loadNeighborhood(
  source: GraphSource,
  project: string,
  root: string,
  options: NeighborhoodOptions = {},
): Promise<GraphViewData> {
  const depth = normalizeDepth(options.depth);
  const direction = options.direction ?? "both";
  const maxNodes = normalizeMaxNodes(options.maxNodes);

  let rootBundle: SymbolBundle;
  try {
    rootBundle = await source.symbol(project, root);
  } catch (cause) {
    throw new Error(
      `Failed to load root symbol "${root}" in project "${project}": ${errorMessage(cause)}`,
      { cause },
    );
  }

  const rootRecord = makeRootRecord(root, rootBundle);
  const nodes = new Map<string, GraphViewNode>();
  const edges = new Map<string, GraphViewEdge>();
  const records = new Map<string, LoadedRecord>();
  const byId = new Map<string, LoadedRecord>();
  const queue: LoadedRecord[] = [];
  let truncated = false;

  addRecord(rootRecord);
  queue.push(rootRecord);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= depth) continue;

    for (const entry of connectionsFor(current.bundle, direction)) {
      const connection = entry.connection;
      const ref = connectionRef(connection);
      if (!ref) continue;

      if (ref === current.id) {
        // Recursive call: keep it as a self edge so the renderer can draw a loop.
        link(current.id, current.id, entry.side, edgeType(connection));
        continue;
      }

      const known = records.get(ref);
      if (known) {
        link(current.id, known.id, entry.side, edgeType(connection));
        continue;
      }

      if (nodes.size >= maxNodes) {
        truncated = true;
        continue;
      }

      let bundle: SymbolBundle;
      try {
        bundle = await source.symbol(project, ref);
      } catch {
        // A missing caller/callee must not kill the rest of the graph.
        continue;
      }

      const id = bundleId(bundle, ref);
      const existing = byId.get(id);
      if (existing) {
        // Two refs (#id and qn) can resolve to the same node.
        records.set(ref, existing);
        link(current.id, existing.id, entry.side, edgeType(connection));
        continue;
      }

      const record: LoadedRecord = {
        id,
        ref,
        depth: current.depth + 1,
        bundle,
      };
      addRecord(record);
      queue.push(record);
      link(current.id, record.id, entry.side, edgeType(connection));
    }
  }

  // The depth boundary is also a budget. Look at bundles on the last layer:
  // if they still have an unfetched connection, the graph is incomplete.
  if (!truncated) {
    for (const record of records.values()) {
      if (record.depth !== depth) continue;
      for (const entry of connectionsFor(record.bundle, direction)) {
        const ref = connectionRef(entry.connection);
        if (ref && ref !== record.id && !records.has(ref)) {
          truncated = true;
          break;
        }
      }
      if (truncated) break;
    }
  }

  return {
    root,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated,
  };

  function addRecord(record: LoadedRecord): void {
    if (nodes.has(record.id)) {
      const existing = byId.get(record.id);
      if (existing) records.set(record.ref, existing);
      return;
    }
    const node = bundleNode(record.bundle, record.ref);
    nodes.set(node.id, node);
    records.set(record.ref, record);
    records.set(record.id, record);
    byId.set(record.id, record);
  }

  function link(
    current: string,
    neighbour: string,
    side: "caller" | "callee",
    type: string,
  ): void {
    if (side === "caller") addEdge(neighbour, current, type);
    else addEdge(current, neighbour, type);
  }

  function addEdge(source: string, target: string, type: string): void {
    if (source === target && !nodes.has(source)) return;
    const key = `${source}\u0000${target}\u0000${type}`;
    if (edges.has(key)) return;
    edges.set(key, {
      id: `${type}:${source}->${target}`,
      source,
      target,
      type,
    });
  }
}

function makeRootRecord(root: string, bundle: SymbolBundle): LoadedRecord {
  return {
    id: bundleId(bundle, root),
    ref: root,
    depth: 0,
    bundle,
  };
}

function normalizeDepth(value: NeighborhoodOptions["depth"]): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return DEFAULT_DEPTH;
}

function normalizeMaxNodes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_NODES;
  return Math.max(1, Math.trunc(value));
}

function bundleId(bundle: SymbolBundle, fallback: string): string {
  const qualified = bundle.node.qualifiedName;
  return qualified && qualified !== "?" ? qualified : fallback;
}

function bundleNode(bundle: SymbolBundle, fallback: string): GraphViewNode {
  const { id, ...rest } = bundle.node;
  const qualifiedName = bundleId(bundle, fallback);
  return {
    ...rest,
    qualifiedName,
    id: qualifiedName,
    symbolId: id,
  };
}

function connectionsFor(
  bundle: SymbolBundle,
  direction: NeighborhoodDirection,
): ConnectionEntry[] {
  const rows: ConnectionEntry[] = [];
  if (direction === "both" || direction === "callers") {
    rows.push(...bundle.callers.map((connection) => ({ connection, side: "caller" as const })));
  }
  if (direction === "both" || direction === "callees") {
    rows.push(...bundle.callees.map((connection) => ({ connection, side: "callee" as const })));
  }
  return rows;
}

function connectionRef(connection: SymbolConnection): string {
  const qualified = connection.qualifiedName;
  if (qualified && qualified !== "?") return qualified;
  if (connection.id !== undefined) return `#${connection.id}`;
  return "";
}

function edgeType(connection: SymbolConnection): string {
  return connection.type || "CALLS";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
