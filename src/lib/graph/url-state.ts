import type { NeighborhoodDirection } from "./neighborhood";

export type SourceKind = "computed" | "cbm";
export type GraphRenderer = "d3" | "orchgraph";
export type Depth = 1 | 2 | 3;

export interface SourceDefaults {
  project: string;
  symbol: string;
}

/** URL defaults for a source, also used when switching source at runtime. */
export const SOURCE_DEFAULTS: Record<SourceKind, SourceDefaults> = {
  computed: {
    project: "demo",
    symbol: "src/main.ts",
  },
  cbm: {
    project: "fixture-hard-scip",
    symbol: "fixture-hard-scip.src.features.useAlias",
  },
};

export interface GraphUrlLocation {
  file: string;
  line: number;
}

export interface GraphUrlState {
  source: SourceKind;
  project: string;
  symbol: string;
  renderer: GraphRenderer;
  depth: Depth;
  direction: NeighborhoodDirection;
}

export interface ParsedGraphUrl extends GraphUrlState {
  location: GraphUrlLocation | null;
}

const RENDERERS: readonly GraphRenderer[] = ["d3", "orchgraph"];
const DIRECTIONS: readonly NeighborhoodDirection[] = ["both", "callers", "callees"];

/** `mock` is the pre-rename URL/config value; keep old links working. */
function parseSource(value: string | null): SourceKind | null {
  if (value === "computed" || value === "mock") return "computed";
  if (value === "cbm") return "cbm";
  return null;
}

function isRenderer(value: string | null): value is GraphRenderer {
  return RENDERERS.includes(value as GraphRenderer);
}

function isDirection(value: string | null): value is NeighborhoodDirection {
  return DIRECTIONS.includes(value as NeighborhoodDirection);
}

function parseDepth(value: string | null, fallback: Depth): Depth {
  const depth = Number(value);
  return depth === 1 || depth === 2 || depth === 3 ? depth : fallback;
}

function parseLocation(params: URLSearchParams): GraphUrlLocation | null {
  const file = params.get("file");
  const line = Number(params.get("line"));
  return file && Number.isFinite(line) && line > 0 ? { file, line } : null;
}

/**
 * Parse a graph URL against the current state. A valid `source` supplies its
 * source-specific project/symbol defaults; omitting `source` keeps the
 * fallback project/symbol unless query values are present.
 */
export function parseGraphUrl(search: string, fallback: GraphUrlState): ParsedGraphUrl {
  const params = new URLSearchParams(search);
  const sourceParam = params.get("source");
  const parsedSource = parseSource(sourceParam);
  const hasSource = parsedSource !== null;
  const source = parsedSource ?? fallback.source;
  const defaults = SOURCE_DEFAULTS[source];
  const project = params.get("project") || (hasSource ? defaults.project : fallback.project);
  const symbol = params.get("symbol") || (hasSource ? defaults.symbol : fallback.symbol);
  const rendererParam = params.get("renderer");
  const directionParam = params.get("direction");

  return {
    source,
    project,
    symbol,
    renderer: isRenderer(rendererParam) ? rendererParam : fallback.renderer,
    depth: parseDepth(params.get("depth"), fallback.depth),
    direction: isDirection(directionParam) ? directionParam : fallback.direction,
    location: parseLocation(params),
  };
}

/** Build the canonical query string used by `history.replaceState`. */
export function formatGraphUrl(state: GraphUrlState, location: GraphUrlLocation | null): string {
  const params = new URLSearchParams();
  params.set("source", state.source);
  params.set("project", state.project);
  params.set("symbol", state.symbol);
  params.set("renderer", state.renderer);
  params.set("depth", String(state.depth));
  params.set("direction", state.direction);
  if (location) {
    params.set("file", location.file);
    params.set("line", String(location.line));
  }
  return `?${params.toString()}`;
}
