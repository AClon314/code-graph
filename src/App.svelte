<script lang="ts">
  import { onMount, tick } from "svelte";
  import { createGraphUiState } from "./lib/state/code-graph";

  import GraphView from "./lib/components/GraphView.svelte";
  import OrchgraphView from "./lib/components/OrchgraphView.svelte";
  import ForAiPanel from "./lib/components/workspace/ForAiPanel.svelte";
  import GraphFooter from "./lib/components/workspace/GraphFooter.svelte";
  import OperationBar from "./lib/components/workspace/OperationBar.svelte";
  import SearchBar from "./lib/components/workspace/SearchBar.svelte";
  import IndexDialog from "./lib/components/workspace/IndexDialog.svelte";
  import SetupPanel from "./lib/components/workspace/SetupPanel.svelte";
  import { CbmHttpSource } from "./lib/graph/cbm-http";
  import {
    DEFAULT_CBM_BASE_URL,
    discoverCbmEndpoint,
    formatCbmEndpointError,
  } from "./lib/cbm-endpoint";
  import { ComputedSource } from "./lib/graph/computed";
  import { createHostFetch } from "./lib/cbm-host-fetch";
  import {
    graphSearchHits,
    graphSearchResultNodes,
    stepSearchIndex,
  } from "./lib/graph/search";
  import {
    bundleFromGraph,
    loadNeighborhood,
    MAX_UNBOUNDED_NODES,
  } from "./lib/graph/neighborhood";
  import type {
    GraphSource,
    GraphViewData,
    GraphViewNode,
    SymbolBundle,
  } from "./lib/graph/types";
  import { extensionApi } from "./extension/host";
  import type { GraphBackend } from "./extension/api";
  import {
    LAYOUT_ALGORITHMS,
    SOURCE_DEFAULTS,
    type LayoutAlgorithm,
    type SourceKind,
  } from "./lib/graph/url-state";
  import { resolveShortcut } from "./lib/shortcuts";
  import { activeJumpRow, jumpToLocation } from "./lib/actions/symbol";
  import { openConfigPath } from "./lib/actions/config";
  import {
    fixFor,
    type SettingsFix,
  } from "./lib/settings-fix";
  import { refForProject } from "./lib/graph/ref-project";
  import { bundleForRef } from "./lib/graph/entry";
  import { fetchRootsFor, loadProjectNames } from "./lib/graph/loaders";
  import { progressLabel } from "./lib/graph/loading";
  import { rootsOverview } from "./lib/graph/overview";
  import { matchLocation, navigationTarget } from "./lib/graph/navigation";
  import { ProgressController } from "./lib/state/progress";
  import {
    loadNodeHtmlRenderer,
    type NodeHtmlRenderer,
  } from "./lib/node-renderer";
  import { errorMessage } from "./lib/errors";
  import { applySettingsFix } from "./lib/actions/fix";
  import { buildAiContext, type CopyMode } from "./lib/ai-context";
  import { copyToolbar, saveToolbar } from "./lib/actions/toolbar";
  import {
    applyEntryPath,
    pathForCandidate,
    resolveEntryPath,
    setPathToWorkspaceRoot,
  } from "./lib/state/symbol-path-entry";
  import type { GraphViewHandle } from "./lib/graph/view-handle";
  import { applyGraphUrlToState, syncGraphUrl } from "./lib/state/url-sync";
  const computedSource = new ComputedSource();

  // All low-frequency UI state is one JSON-safe object. Zoom/pan gesture state
  // stays inside GraphView so it never churns this object.
  const codeGraph = $state(
    createGraphUiState({
      runtime: extensionApi.runtime,
      source: "computed",
      project: "demo",
      entry: "",
    }),
  );

  // Expose the low-frequency snapshot in every host's devtools:
  // copy(JSON.stringify(codeGraph)). Gesture state remains inside GraphView.
  if (typeof window !== "undefined") {
    (window as unknown as { codeGraph: typeof codeGraph }).codeGraph = codeGraph;
  }
  let requestId = 0;
  let graphRequestId = 0;
  let detailRequestId = 0;
  let graphView = $state<GraphViewHandle>();
  let nodeRender = $state<NodeHtmlRenderer | null>(null);
  let searchCursor = $state(-1);
  let indexOpen = $state(false);
  const progress = new ProgressController(codeGraph.current.load);

  const selectedNode = $derived(
    codeGraph.current.graph?.nodes.find((node) => node.id === codeGraph.current.selection.id) ?? codeGraph.current.selection.node,
  );

  const selectionBundle = $derived(
    codeGraph.current.graph && selectedNode ? bundleFromGraph(codeGraph.current.graph, selectedNode.id) ?? null : null,
  );
  const aiContext = $derived(
    buildAiContext(codeGraph.current.detail.symbol ?? selectionBundle, selectedNode ?? codeGraph.current.selection.node, codeGraph.setup.workspaceRoot),
  );

  const searchHits = $derived(graphSearchHits(codeGraph.current.graph, codeGraph.current.ui.search));
  const searchResults = $derived(graphSearchResultNodes(codeGraph.current.graph, searchHits));
  const searchCurrent = $derived(
    searchCursor >= 0 && searchCursor < searchResults.length ? searchCursor + 1 : 0,
  );
  $effect(() => {
    if (searchCursor >= searchResults.length) searchCursor = -1;
  });
  const loadStatus = $derived(
    codeGraph.current.load.progress
      ? progressLabel(codeGraph.current.load.progress)
      : "",
  );
  const layoutStatus = $derived(
    codeGraph.current.load.layout ? "Laying out graph…" : "",
  );
  const hostFetch = createHostFetch(extensionApi.fetchCbm);

  function currentSource(): GraphSource {
    return codeGraph.setup.source === "computed"
      ? computedSource
      : new CbmHttpSource({
          baseUrl: codeGraph.setup.cbmBaseUrl,
          project: codeGraph.setup.project,
          fetchImpl: codeGraph.setup.runtime === "webview" ? hostFetch : undefined,
        });
  }

  async function openFix(fix: SettingsFix | null): Promise<void> {
    if (await applySettingsFix(fix, extensionApi, codeGraph.current.status)) {
      await reloadGraph();
    }
  }

  async function load(): Promise<void> {
    const id = ++requestId;
    progress.stop();
    codeGraph.current.load.symbol = true;
    codeGraph.current.status.error = "";
    codeGraph.current.status.errorFix = null;
    codeGraph.current.status.graphFix = null;
    codeGraph.current.detail.error = "";
    codeGraph.current.detail.loading = false;
    detailRequestId += 1;
    codeGraph.current.status.jump = "";
    codeGraph.current.status.jumpError = "";
    codeGraph.current.status.copy = "";
    codeGraph.current.status.copyError = "";
    codeGraph.current.status.export = "";

    if (codeGraph.setup.source === "cbm" && !(await ensureCbmEndpoint())) {
      codeGraph.current.load.symbol = false;
      codeGraph.current.detail.symbol = null;
      codeGraph.current.graph = null;
      codeGraph.current.load.graph = false;
      codeGraph.current.status.graphError = "";
      codeGraph.setup.roots = [];
      syncUrl();
      return;
    }
    void loadProjects();
    codeGraph.setup.refProject = codeGraph.setup.project;

    const entry = codeGraph.setup.entry.trim();
    if (!entry) {
      codeGraph.current.load.symbol = false;
      codeGraph.current.detail.symbol = null;
      codeGraph.current.status.error = "";
      codeGraph.current.status.errorFix = null;
      await loadOverview(id);
      syncUrl();
      return;
    }

    void loadRoots();

    progress.begin("Loading symbol", null);
    const source = currentSource();
    const symbolResult = await source.symbol(codeGraph.setup.project, codeGraph.setup.entry).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    if (id !== requestId) return;

    const problems: string[] = [];

    if (symbolResult.status === "fulfilled") {
      codeGraph.current.detail.symbol = symbolResult.value;
      codeGraph.current.selection.id = codeGraph.current.detail.symbol.node.qualifiedName;
      codeGraph.current.selection.node = null;
    } else {
      codeGraph.current.detail.symbol = null;
      codeGraph.current.selection.id = "";
      codeGraph.current.selection.node = null;
      problems.push(`symbol: ${errorMessage(symbolResult.reason)}`);
      codeGraph.current.status.errorFix = fixFor(symbolResult.reason, codeGraph.setup.backend);
    }

    codeGraph.current.load.symbol = false;
    codeGraph.current.status.error = problems.join("\n");

    if (symbolResult.status === "fulfilled") {
      await loadGraph(source, codeGraph.setup.entry, id, symbolResult.value);
    } else {
      progress.stop();
      graphRequestId += 1;
      codeGraph.current.load.graph = false;
      codeGraph.current.graph = null;
      codeGraph.current.status.graphError = "";
    }
    syncUrl();
  }

  async function loadOverview(request: number): Promise<void> {
    const id = ++graphRequestId;
    setPathToWorkspaceRoot(codeGraph);
    codeGraph.current.load.graph = true;
    codeGraph.current.status.graphError = "";
    codeGraph.current.status.graphFix = null;
    codeGraph.current.status.error = "";
    codeGraph.current.status.errorFix = null;
    codeGraph.current.graph = null;
    codeGraph.current.selection.id = "";
    codeGraph.current.selection.node = null;
    progress.begin("Loading entries", null);
    try {
      await loadRoots();
      if (id !== graphRequestId || request !== requestId) return;
      const roots = codeGraph.setup.roots;
      if (roots.length === 0) {
        codeGraph.current.status.graphError =
          codeGraph.setup.source === "cbm"
            ? "No entry roots found for this project."
            : "No entry roots configured for this source.";
        codeGraph.current.graph = null;
        return;
      }
      codeGraph.current.graph = rootsOverview(roots);
    } finally {
      if (id === graphRequestId) {
        codeGraph.current.load.graph = false;
        progress.stop();
      }
    }
  }

  async function loadRoots(): Promise<void> {
    codeGraph.setup.loading.roots = true;
    try {
      codeGraph.setup.roots = await fetchRootsFor(
        codeGraph.setup.source,
        codeGraph.setup.cbmBaseUrl,
        codeGraph.setup.project,
        codeGraph.setup.runtime === "webview" ? hostFetch : undefined,
      );
    } catch (cause) {
      console.warn("[code-graph] could not load root entries", cause);
      codeGraph.setup.roots = [];
    } finally {
      codeGraph.setup.loading.roots = false;
    }
  }

  async function loadProjects(): Promise<void> {
    await loadProjectNames(codeGraph, (request) => extensionApi.fetchCbm(request));
  }

  async function ensureCbmEndpoint(): Promise<boolean> {
    // Browser web uses Vite's same-origin /api proxy; there is no node-side
    // port discovery to run there.
    if (codeGraph.setup.runtime === "webview" || codeGraph.setup.runtime === "browser") return true;
    try {
      const result = await discoverCbmEndpoint({
        candidates: [codeGraph.setup.cbmBaseUrl, DEFAULT_CBM_BASE_URL],
      });
      codeGraph.setup.cbmBaseUrl = result.baseUrl;
      return true;
    } catch (cause) {
      console.error("[code-graph] cbm endpoint discovery failed", cause);
      codeGraph.current.status.error = formatCbmEndpointError(cause);
      codeGraph.current.status.errorFix = fixFor(cause, codeGraph.setup.backend);
      return false;
    }
  }

  async function loadGraph(
    source: GraphSource,
    root: string,
    request: number,
    rootBundle?: SymbolBundle,
  ): Promise<void> {
    const id = ++graphRequestId;
    codeGraph.current.load.graph = true;
    codeGraph.current.status.graphError = "";
    codeGraph.current.status.graphFix = null;
    codeGraph.current.graph = null;
    progress.begin("Loading graph", null);

    try {
      const next = await loadNeighborhood(source, codeGraph.setup.project, root, {
        depth: codeGraph.current.view.depth,
        direction: codeGraph.current.view.direction,
        maxNodes: codeGraph.current.view.depth === null ? MAX_UNBOUNDED_NODES : undefined,
        rootBundle,
        onProgress: (update) => progress.update(update),
      });
      if (id !== graphRequestId || request !== requestId) return;
      codeGraph.current.graph = next;
      if (!next.nodes.some((node) => node.id === codeGraph.current.selection.id)) {
        const rootNode = next.nodes[0];
        codeGraph.current.selection.id = rootNode?.id ?? next.root;
        codeGraph.current.selection.node = null;
      }
      const chosen = next.nodes.find((node) => node.id === codeGraph.current.selection.id) ?? next.nodes[0];
      if (chosen) codeGraph.setup.path = pathForCandidate(chosen, codeGraph.setup.workspaceRoot);
      applyPendingLocation(next);
    } catch (cause) {
      if (id !== graphRequestId || request !== requestId) return;
      codeGraph.current.status.graphError = errorMessage(cause);
      codeGraph.current.status.graphFix = fixFor(cause, codeGraph.setup.backend);
      console.error("[code-graph] graph load failed", cause);
    } finally {
      if (id === graphRequestId) {
        codeGraph.current.load.graph = false;
        progress.stop();
      }
    }
  }

  async function reloadGraph(reuseRootBundle = false): Promise<void> {
    if (!codeGraph.setup.entry.trim()) {
      await loadOverview(requestId);
      return;
    }
    const id = ++graphRequestId;
    codeGraph.current.load.graph = true;
    codeGraph.current.status.graphError = "";
    codeGraph.current.status.graphFix = null;
    codeGraph.current.status.export = "";
    progress.begin("Loading graph", null);

    try {
      const source = currentSource();
      const currentGraph = codeGraph.current.graph;
      const rootBundle =
        bundleForRef(codeGraph.current.detail.symbol, codeGraph.setup.entry) ??
        (reuseRootBundle && currentGraph?.root
          ? bundleFromGraph(currentGraph, codeGraph.current.selection.id)
          : undefined);
      const next = await loadNeighborhood(source, codeGraph.setup.project, codeGraph.setup.entry, {
        depth: codeGraph.current.view.depth,
        direction: codeGraph.current.view.direction,
        maxNodes: codeGraph.current.view.depth === null ? MAX_UNBOUNDED_NODES : undefined,
        rootBundle,
        onProgress: (update) => progress.update(update),
      });
      if (id !== graphRequestId) return;
      codeGraph.current.graph = next;
      if (!next.nodes.some((node) => node.id === codeGraph.current.selection.id)) {
        const rootNode = next.nodes[0];
        codeGraph.current.selection.id = rootNode?.id ?? next.root;
        codeGraph.current.selection.node = null;
      }
      const chosen = next.nodes.find((node) => node.id === codeGraph.current.selection.id) ?? next.nodes[0];
      if (chosen) codeGraph.setup.path = pathForCandidate(chosen, codeGraph.setup.workspaceRoot);
    } catch (cause) {
      if (id !== graphRequestId) return;
      codeGraph.current.graph = null;
      codeGraph.current.status.graphError = errorMessage(cause);
      codeGraph.current.status.graphFix = fixFor(cause, codeGraph.setup.backend);
      console.error("[code-graph] graph load failed", cause);
    } finally {
      if (id === graphRequestId) {
        codeGraph.current.load.graph = false;
        progress.stop();
      }
    }
  }

  onMount(() => {
    let disposed = false;

    void (async () => {
      try {
        const config = await extensionApi.getConfig();
        if (disposed) return;
        codeGraph.setup.runtime = extensionApi.runtime;
        codeGraph.setup.backend = config.backend;
        if (config.source === "computed" || config.source === "cbm") codeGraph.setup.source = config.source;
        codeGraph.setup.cbmBaseUrl = config.cbmBaseUrl;
        codeGraph.setup.workspaceRoot = config.workspaceRoot;
        if (!codeGraph.setup.path) codeGraph.setup.path = config.workspaceRoot;
        codeGraph.setup.configPath = config.configPath;
        codeGraph.setup.nodeRendererPath = config.nodeRendererPath;
        nodeRender = await loadNodeHtmlRenderer(config.nodeRendererUrl);
        if (disposed) return;
        if (config.project) codeGraph.setup.project = config.project;
        if (config.symbolEntry) codeGraph.setup.entry = config.symbolEntry;
      } catch (cause) {
        console.error("[code-graph] config load failed", cause);
        codeGraph.current.status.error = formatCbmEndpointError(cause);
        codeGraph.current.status.errorFix = fixFor(cause, codeGraph.setup.backend);
        return;
      }

      if (disposed) return;
      applyUrl();
      void load();
    })();

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onGlobalKeydown);
    return () => {
      disposed = true;
      progress.stop();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onGlobalKeydown);
    };
  });

  function applyUrl(): void {
    if (typeof window === "undefined") return;
    applyGraphUrlToState(codeGraph, window.location.search);
  }

  function onPopState(): void {
    applyUrl();
    void load();
  }

  function syncUrl(): void {
    syncGraphUrl(codeGraph);
  }

  function applyPendingLocation(next: GraphViewData): void {
    const match = matchLocation(next.nodes, codeGraph.current.navigation.pendingLocation);
    if (!match) return;
    codeGraph.current.navigation.pendingLocation = null;
    codeGraph.current.selection.id = match.id;
    codeGraph.current.selection.node = match;
    codeGraph.setup.entry = match.qualifiedName || match.id;
    codeGraph.setup.path = pathForCandidate(match, codeGraph.setup.workspaceRoot);
    void selectGraphNode(match);
  }

  async function setKind(next: SourceKind): Promise<void> {
    codeGraph.setup.source = next;
    if (next === "computed") {
      const defaults = SOURCE_DEFAULTS.computed;
      codeGraph.setup.project = defaults.project;
      codeGraph.setup.entry = defaults.symbol;
    } else {
      try {
        const config = await extensionApi.getConfig(codeGraph.setup.backend);
        codeGraph.setup.project = config.project;
        codeGraph.setup.entry = config.symbolEntry;
      } catch (cause) {
        codeGraph.current.status.error = `Backend setup failed: ${errorMessage(cause)}`;
        return;
      }
    }
    await load();
  }

  function setProject(value: string, commit = false): void {
    if (value !== codeGraph.setup.project) {
      codeGraph.setup.entry = refForProject(codeGraph.setup.entry, codeGraph.setup.refProject, value);
      codeGraph.setup.project = value;
    }
    codeGraph.setup.refProject = value;
    if (commit) void load();
  }

  async function setBackend(next: GraphBackend): Promise<void> {
    if (next === codeGraph.setup.backend) return;
    codeGraph.setup.backend = next;
    if (codeGraph.setup.source !== "cbm") return;
    try {
      const config = await extensionApi.getConfig(next);
      if (codeGraph.setup.runtime === "browser") {
        // The web shell has no per-backend project settings. Preserve the
        // project the user is looking at and apply the cbm/scip suffix.
        const base = codeGraph.setup.project.endsWith("-scip") ? codeGraph.setup.project.slice(0, -5) : codeGraph.setup.project;
        const nextProject = next === "scip" ? `${base}-scip` : base;
        codeGraph.setup.entry = refForProject(codeGraph.setup.entry, codeGraph.setup.refProject, nextProject);
        codeGraph.setup.refProject = nextProject;
        codeGraph.setup.project = nextProject;
      } else {
        codeGraph.setup.project = config.project;
        codeGraph.setup.entry = config.symbolEntry;
        codeGraph.setup.refProject = config.project;
      }
      codeGraph.setup.cbmBaseUrl = config.cbmBaseUrl;
      codeGraph.setup.workspaceRoot = config.workspaceRoot;
      await load();
    } catch (cause) {
      codeGraph.current.status.error = `Backend switch failed: ${errorMessage(cause)}`;
    }
  }

  function openConnection(value: string): void {
    const resolved = resolveEntryPath(codeGraph, value);
    if (!resolved?.qualifiedName) {
      codeGraph.current.status.error = `No symbol matches ${value}`;
      return;
    }
    codeGraph.setup.entry = resolved.qualifiedName;
    codeGraph.setup.path = pathForCandidate(resolved, codeGraph.setup.workspaceRoot);
    codeGraph.current.ui.inspectorOpen = true;
    codeGraph.current.ui.setupOpen = false;
    syncUrl();
    void load();
  }

  function changeRenderer(value: string): void {
    if (value !== "d3" && value !== "orchgraph") return;
    codeGraph.current.view.renderer = value;
    syncUrl();
  }

  function onDepthChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (input.validity.badInput) {
      input.value = String(codeGraph.current.view.depth ?? "");
      return;
    }
    const text = input.value.trim();
    if (!text) {
      codeGraph.current.view.depth = null;
      syncUrl();
      void reloadGraph();
      return;
    }
    const next = Number(text);
    if (!Number.isInteger(next) || next < 1) {
      input.value = String(codeGraph.current.view.depth ?? "");
      return;
    }
    const reuseRootBundle = codeGraph.current.view.depth === null;
    codeGraph.current.view.depth = next;
    syncUrl();
    void reloadGraph(reuseRootBundle);
  }

  function changeLayout(value: string): void {
    if (!(LAYOUT_ALGORITHMS as readonly string[]).includes(value)) return;
    codeGraph.current.view.layout = value as LayoutAlgorithm;
    syncUrl();
  }

  function changeDirection(value: string): void {
    if (value !== "both" && value !== "callers" && value !== "callees") return;
    const reuseRootBundle = codeGraph.current.view.depth === null;
    codeGraph.current.view.direction = value;
    syncUrl();
    void reloadGraph(reuseRootBundle);
  }

  function openConfigFile(path: string): void {
    openConfigPath(
      path,
      codeGraph.setup.runtime,
      extensionApi,
      codeGraph.current.status,
    );
  }

  function clearSelection(): void {
    if (!codeGraph.current.selection.id && !codeGraph.current.selection.node) return;
    codeGraph.current.selection.id = "";
    codeGraph.current.selection.node = null;
    codeGraph.current.detail.symbol = null;
    codeGraph.current.detail.error = "";
    codeGraph.current.ui.inspectorOpen = false;
    syncUrl();
  }

  async function selectGraphNode(node: GraphViewNode): Promise<void> {
    codeGraph.current.selection.id = node.id;
    codeGraph.current.selection.node = node;
    codeGraph.setup.entry = node.qualifiedName || node.id;
    codeGraph.setup.path = pathForCandidate(node, codeGraph.setup.workspaceRoot);
    codeGraph.current.ui.setupOpen = false;
    syncUrl();
    if (codeGraph.current.ui.inspectorOpen) {
      await loadDetail(node);
    } else {
      codeGraph.current.detail.symbol = null;
      codeGraph.current.detail.error = "";
      codeGraph.current.detail.loading = false;
    }
  }

  async function loadDetail(node: GraphViewNode): Promise<void> {
    codeGraph.current.detail.symbol = null;
    codeGraph.current.detail.error = "";
    codeGraph.current.detail.loading = true;
    codeGraph.current.status.jump = "";
    codeGraph.current.status.jumpError = "";
    codeGraph.current.status.copy = "";
    codeGraph.current.status.copyError = "";
    codeGraph.current.status.export = "";

    const id = ++detailRequestId;
    try {
      const bundle = await currentSource().symbol(codeGraph.setup.project, node.qualifiedName || node.id);
      if (id !== detailRequestId) return;
      codeGraph.current.detail.symbol = bundle;
    } catch (cause) {
      if (id !== detailRequestId) return;
      console.error("[code-graph] symbol detail failed", cause);
      codeGraph.current.detail.symbol = null;
      codeGraph.current.detail.error = `Could not load symbol details: ${errorMessage(cause)}`;
    } finally {
      if (id === detailRequestId) codeGraph.current.detail.loading = false;
    }
  }

  function onEntryCommit(value: string): void {
    const error = applyEntryPath(codeGraph, value);
    if (error) {
      codeGraph.current.status.error = error;
      return;
    }
    void load();
  }

  function toggleSetup(): void {
    codeGraph.current.ui.setupOpen = !codeGraph.current.ui.setupOpen;
    if (codeGraph.current.ui.setupOpen) {
      codeGraph.current.ui.inspectorOpen = false;
      if (codeGraph.setup.source === "cbm" && codeGraph.setup.projects.length === 0) {
        void loadProjects();
      }
    }
  }

  function toggleInspector(): void {
    codeGraph.current.ui.inspectorOpen = !codeGraph.current.ui.inspectorOpen;
    if (codeGraph.current.ui.inspectorOpen) {
      codeGraph.current.ui.setupOpen = false;
      const node = selectedNode;
      if (
        node &&
        !codeGraph.current.detail.loading &&
        codeGraph.current.detail.symbol?.node.qualifiedName !== node.qualifiedName
      ) {
        void loadDetail(node);
      }
    }
  }

  function focusSearch(): void {
    document.querySelector<HTMLInputElement>('input[aria-label="Search graph"]')?.focus();
  }

  function onGlobalKeydown(event: KeyboardEvent): void {
    const action = resolveShortcut(event, {
      setupOpen: codeGraph.current.ui.setupOpen,
      inspectorOpen: codeGraph.current.ui.inspectorOpen,
      hasSelection: Boolean(selectedNode),
    });
    if (!action) return;
    event.preventDefault();

    const step = 80;
    switch (action) {
      case "search":
        void openSearch();
        break;
      case "reload":
        void reloadGraph();
        break;
      case "toggle-details":
        toggleInspector();
        break;
      case "toggle-setup":
        toggleSetup();
        break;
      case "fit":
        graphView?.fit();
        break;
      case "pan-up":
        graphView?.panScreen?.(0, step);
        break;
      case "pan-down":
        graphView?.panScreen?.(0, -step);
        break;
      case "pan-left":
        graphView?.panScreen?.(step, 0);
        break;
      case "pan-right":
        graphView?.panScreen?.(-step, 0);
        break;
      case "zoom-in":
        graphView?.zoomBy?.(1.2);
        break;
      case "zoom-out":
        graphView?.zoomBy?.(1 / 1.2);
        break;
      case "nav-callers":
        navigateGraph("callers");
        break;
      case "nav-callees":
        navigateGraph("callees");
        break;
      case "nav-prev-sibling":
        navigateGraph("sibling", -1);
        break;
      case "nav-next-sibling":
        navigateGraph("sibling", 1);
        break;
      case "copy-relative":
        void copyWithMode("relative");
        break;
      case "copy-relative-or-svg":
        void copyWithMode(activeJumpRow(codeGraph.current.selection.node, codeGraph.current.detail.symbol) ? "relative" : "svg");
        break;
      case "close-setup":
        codeGraph.current.ui.setupOpen = false;
        break;
      case "close-details":
        codeGraph.current.ui.inspectorOpen = false;
        break;
    }
  }

  function navigateGraph(direction: "callers" | "callees" | "sibling", offset = 1): void {
    const graph = codeGraph.current.graph;
    const current = selectedNode;
    if (!graph || !current) return;
    const next = navigationTarget(graph, current.id, direction, offset);
    if (!next) return;
    void selectGraphNode(next);
    graphView?.focusNode?.(next.id);
  }

  async function openSearch(): Promise<void> {
    codeGraph.current.ui.searchOpen = true;
    await tick();
    focusSearch();
  }

  function closeSearch(): void {
    codeGraph.current.ui.searchOpen = false;
    codeGraph.current.ui.search = "";
    searchCursor = -1;
  }

  function toggleSearch(): void {
    if (codeGraph.current.ui.searchOpen) closeSearch();
    else void openSearch();
  }

  function onSearchInput(value: string): void {
    codeGraph.current.ui.search = value;
    searchCursor = -1;
  }

  function stepSearch(delta: number): void {
    if (searchResults.length === 0) return;
    searchCursor = stepSearchIndex(searchCursor, searchResults.length, delta);
    const node = searchResults[searchCursor];
    if (!node) return;
    void selectGraphNode(node);
    graphView?.focusNode?.(node.id);
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      stepSearch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  }

  async function handleIndexed(project: string): Promise<void> {
    indexOpen = false;
    codeGraph.setup.source = "cbm";
    codeGraph.setup.backend = "cbm";
    codeGraph.setup.project = project;
    codeGraph.setup.refProject = project;
    codeGraph.setup.entry = "";
    codeGraph.current.ui.setupOpen = false;
    await load();
  }

  function jumpFromNode(node: GraphViewNode): void {
    codeGraph.current.selection.id = node.id;
    codeGraph.current.selection.node = node;
    codeGraph.setup.entry = node.qualifiedName || node.id;
    codeGraph.setup.path = pathForCandidate(node, codeGraph.setup.workspaceRoot);
    syncUrl();
    void jumpToLocation(node, codeGraph.setup.project, extensionApi, codeGraph.current.status);
  }

  async function copyWithMode(mode: CopyMode): Promise<void> {
    await copyToolbar({
      mode,
      view: graphView,
      renderer: codeGraph.current.view.renderer,
      row: activeJumpRow(codeGraph.current.selection.node, codeGraph.current.detail.symbol),
      workspaceRoot: codeGraph.setup.workspaceRoot,
      context: aiContext,
      status: codeGraph.current.status,
    });
  }

  async function copyCurrent(): Promise<void> {
    await copyWithMode(codeGraph.current.ui.copyMode);
  }

  function saveCurrent(): void {
    saveToolbar({
      mode: codeGraph.current.ui.saveMode,
      view: graphView,
      entry: codeGraph.setup.entry,
      status: codeGraph.current.status,
    });
  }

</script>

<main class="app">
  <div class="workbench">
    {#if codeGraph.current.ui.setupOpen}
      <SetupPanel
        kind={codeGraph.setup.source}
        project={codeGraph.setup.project}
        projects={codeGraph.setup.projects}
        projectsLoading={codeGraph.setup.loading.projects}
        runtime={codeGraph.setup.runtime}
        backend={codeGraph.setup.backend}
        configPath={codeGraph.setup.configPath}
        nodeRendererPath={codeGraph.setup.nodeRendererPath}
        onsource={setKind}
        onbackend={setBackend}
        onproject={(value) => setProject(value)}
        onprojectcommit={(value) => setProject(value, true)}
        onopenconfig={openConfigFile}
        onopenindex={() => (indexOpen = true)}
        onclose={() => (codeGraph.current.ui.setupOpen = false)}
      />
    {/if}

    {#if indexOpen}
      <IndexDialog
        fetchCbm={(request) => extensionApi.fetchCbm(request)}
        initialRoot={codeGraph.setup.workspaceRoot}
        onclose={() => (indexOpen = false)}
        onindexed={(project) => void handleIndexed(project)}
      />
    {/if}

    <section
      class="graph-stage"
      aria-label="Call graph"
      aria-busy={codeGraph.current.load.graph || codeGraph.current.load.layout}
    >
      <div class="graph-frame">
        {#if codeGraph.current.graph}
          {#if codeGraph.current.view.renderer === "orchgraph"}
            <OrchgraphView
              bind:this={graphView}
              data={codeGraph.current.graph}
              selectedId={codeGraph.current.selection.id}
              {searchHits}
              focusOnly={codeGraph.current.view.focusOnly}
              onselect={(node) => void selectGraphNode(node)}
              onjump={jumpFromNode}
              onlayoutstatus={(value) => (codeGraph.current.load.layout = value)}
              onclear={clearSelection}
            />
          {:else}
            <GraphView
              bind:this={graphView}
              data={codeGraph.current.graph}
              selectedId={codeGraph.current.selection.id}
              {searchHits}
              layoutAlgorithm={codeGraph.current.view.layout}
              focusOnly={codeGraph.current.view.focusOnly}
              project={codeGraph.setup.project}
              nodeRender={nodeRender ?? undefined}
              onselect={(node) => void selectGraphNode(node)}
              onjump={jumpFromNode}
              onlayoutstatus={(value) => (codeGraph.current.load.layout = value)}
              onclear={clearSelection}
            />
          {/if}
        {:else}
          <div class="graph-empty">
            <p class="graph-empty-title">
              {codeGraph.current.load.graph || codeGraph.current.load.symbol ? "Loading neighborhood…" : "No graph loaded"}
            </p>
            <p class="sub">Choose a path in the path bar below, or open Setup to pick a source.</p>
          </div>
        {/if}
      </div>

      {#if codeGraph.current.ui.searchOpen}
        <SearchBar
          value={codeGraph.current.ui.search}
          current={searchCurrent}
          total={searchResults.length}
          oninput={onSearchInput}
          onkeydown={onSearchKeydown}
          onprevious={() => stepSearch(-1)}
          onnext={() => stepSearch(1)}
        />
      {/if}

      <GraphFooter
        error={codeGraph.current.status.error}
        errorFix={codeGraph.current.status.errorFix}
        graphError={codeGraph.current.status.graphError}
        graphFix={codeGraph.current.status.graphFix}
        progress={codeGraph.current.load.progress}
        {loadStatus}
        {layoutStatus}
        graph={codeGraph.current.graph}
        {selectedNode}
        exportStatus={codeGraph.current.status.export}
        copyStatus={codeGraph.current.status.copy}
        copyError={codeGraph.current.status.copyError}
        jumpStatus={codeGraph.current.status.jump}
        jumpError={codeGraph.current.status.jumpError}
        runtime={codeGraph.setup.runtime}
        sourceLabel={codeGraph.setup.source === "computed" ? "computed" : codeGraph.setup.backend}
        depth={codeGraph.current.view.depth}
        direction={codeGraph.current.view.direction}
        layout={codeGraph.current.view.layout}
        renderer={codeGraph.current.view.renderer}
        focusOnly={codeGraph.current.view.focusOnly}
        focusAvailable={Boolean(selectedNode)}
        ondepth={onDepthChange}
        ondirection={changeDirection}
        onlayout={changeLayout}
        onrenderer={changeRenderer}
        onfocusonly={(value) => (codeGraph.current.view.focusOnly = value)}
        onopenfix={(fix) => void openFix(fix)}
        ondismisserror={() => {
          codeGraph.current.status.error = "";
          codeGraph.current.status.errorFix = null;
        }}
        ondismissgraph={() => {
          codeGraph.current.status.graphError = "";
          codeGraph.current.status.graphFix = null;
        }}
      />

      <OperationBar
        bind:entry={codeGraph.setup.path}
        bind:copyMode={codeGraph.current.ui.copyMode}
        bind:saveMode={codeGraph.current.ui.saveMode}
        cwd={codeGraph.setup.workspaceRoot}
        setupOpen={codeGraph.current.ui.setupOpen}
        inspectorOpen={codeGraph.current.ui.inspectorOpen}
        searchOpen={codeGraph.current.ui.searchOpen}
        renderer={codeGraph.current.view.renderer}
        graphLoaded={Boolean(codeGraph.current.graph)}
        roots={codeGraph.setup.roots}
        rootsLoading={codeGraph.setup.loading.roots}
        ontogglesearch={toggleSearch}
        ontogglesetup={toggleSetup}
        ontoggledetails={toggleInspector}
        onfit={() => graphView?.fit()}
        oncopy={() => void copyCurrent()}
        onsave={saveCurrent}
        onentrycommit={onEntryCommit}
      />
    </section>

    {#if codeGraph.current.ui.inspectorOpen}
      <ForAiPanel
        context={aiContext}
        mode={codeGraph.current.ui.detailMode}
        loading={codeGraph.current.detail.loading}
        error={codeGraph.current.detail.error}
        onmode={(mode) => (codeGraph.current.ui.detailMode = mode)}
        onclose={() => (codeGraph.current.ui.inspectorOpen = false)}
        onopen={openConnection}
      />
    {/if}
  </div>
</main>
