/**
 * Serialisable UI state for the code graph shell.
 *
 * Keep this object free of DOM handles, D3 transforms, timers and functions:
 * every field is intentionally JSON-safe so `JSON.stringify(codeGraph)` can be
 * copied into a bug report or restored after a reload. High-frequency gesture
 * state (zoom/pan) belongs to GraphView and must not enter this object.
 */
import type { GraphBackend, Runtime } from "../../extension/api";
import type { RootCandidate } from "../graph/roots";
import type { CbmProject } from "../cbm-projects";
import type { GraphViewData, GraphViewNode, SymbolBundle } from "../graph/types";
import type { NeighborhoodDirection } from "../graph/neighborhood";
import type { Depth, GraphRenderer, LayoutAlgorithm, SourceKind } from "../graph/url-state";
import type { SettingsFix } from "../settings-fix";
import type { LoadProgress } from "../graph/loading";
import { NODE_RENDERER_FILE } from "../node-renderer";
import type { CopyMode, DetailMode, SaveMode } from "../ai-context";

export interface SetupState {
  source: SourceKind;
  project: string;
  /** Qualified name consumed by the graph source. */
  entry: string;
  /** Editable global symbol path; defaults to the workspace root. */
  path: string;
  /** Project that produced the current entry; used to rewrite QNs. */
  refProject: string;
  backend: GraphBackend;
  cbmBaseUrl: string;
  workspaceRoot: string;
  runtime: Runtime;
  /** Workspace-relative file paths used by the Setup links. */
  configPath: string;
  nodeRendererPath: string;
  roots: RootCandidate[];
  projects: string[];
  /** Indexed project metadata used to auto-select by workspace root. */
  projectRows: CbmProject[];
  loading: {
    roots: boolean;
    projects: boolean;
  };
}

export interface ViewState {
  depth: Depth;
  direction: NeighborhoodDirection;
  layout: LayoutAlgorithm;
  renderer: GraphRenderer;
  /** Hide nodes outside the selected node's ancestor/descendant call paths. */
  focusOnly: boolean;
}

export interface SelectionState {
  id: string;
  /** Selected node from the graph; cleared when the graph is replaced. */
  node: GraphViewNode | null;
}

export interface DetailState {
  symbol: SymbolBundle | null;
  loading: boolean;
  error: string;
}

export interface LoadState {
  symbol: boolean;
  graph: boolean;
  layout: boolean;
  progress: LoadProgress | null;
}

export interface UiState {
  setupOpen: boolean;
  inspectorOpen: boolean;
  /** The extra search row is opt-in; the bottom bar stays two rows by default. */
  searchOpen: boolean;
  search: string;
  copyMode: CopyMode;
  saveMode: SaveMode;
  detailMode: DetailMode;
}

export interface StatusState {
  error: string;
  errorFix: SettingsFix | null;
  graphError: string;
  graphFix: SettingsFix | null;
  jump: string;
  jumpError: string;
  copy: string;
  copyError: string;
  export: string;
}

export interface NavigationState {
  pendingLocation: { file: string; line: number } | null;
}

export interface CurrentState {
  graph: GraphViewData | null;
  selection: SelectionState;
  detail: DetailState;
  view: ViewState;
  load: LoadState;
  ui: UiState;
  status: StatusState;
  navigation: NavigationState;
}

export interface GraphUiState {
  setup: SetupState;
  current: CurrentState;
}

export interface GraphUiStateInit {
  runtime?: Runtime;
  backend?: GraphBackend;
  source?: SourceKind;
  project?: string;
  entry?: string;
  path?: string;
  cbmBaseUrl?: string;
  workspaceRoot?: string;
  configPath?: string;
  nodeRendererPath?: string;
}

export function createGraphUiState(init: GraphUiStateInit = {}): GraphUiState {
  const source = init.source ?? "computed";
  const project = init.project ?? "demo";
  const entry = init.entry ?? "";
  return {
    setup: {
      source,
      project,
      entry,
      path: init.path ?? init.workspaceRoot ?? "",
      refProject: project,
      backend: init.backend ?? "cbm",
      cbmBaseUrl: init.cbmBaseUrl ?? "http://127.0.0.1:9749",
      workspaceRoot: init.workspaceRoot ?? "",
      runtime: init.runtime ?? "browser",
      configPath: init.configPath ?? "code-graph.config.jsonc",
      nodeRendererPath: init.nodeRendererPath ?? NODE_RENDERER_FILE,
      roots: [],
      projects: [],
      projectRows: [],
      loading: { roots: false, projects: false },
    },
    current: {
      graph: null,
      selection: { id: "", node: null },
      detail: { symbol: null, loading: false, error: "" },
      // An empty depth is the full reachable graph (bounded by
      // MAX_UNBOUNDED_NODES in the loader), not "no graph".
      view: {
        depth: null,
        direction: "both",
        layout: "layered",
        renderer: "d3",
        focusOnly: false,
      },
      load: { symbol: false, graph: false, layout: false, progress: null },
      ui: {
        setupOpen: false,
        inspectorOpen: false,
        searchOpen: false,
        search: "",
        copyMode: "svg",
        saveMode: "svg",
        detailMode: "raw",
      },
      status: {
        error: "",
        errorFix: null,
        graphError: "",
        graphFix: null,
        jump: "",
        jumpError: "",
        copy: "",
        copyError: "",
        export: "",
      },
      navigation: { pendingLocation: null },
    },
  };
}
