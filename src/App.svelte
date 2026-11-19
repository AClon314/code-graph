<script lang="ts">
  import { onMount } from "svelte";
  import { createGraphUiState } from "./lib/state/code-graph";

  import GraphView from "./lib/components/GraphView.svelte";
  import OrchgraphView from "./lib/components/OrchgraphView.svelte";
  import InspectorPanel from "./lib/components/workspace/InspectorPanel.svelte";
  import GraphFooter from "./lib/components/workspace/GraphFooter.svelte";
  import TopBar from "./lib/components/workspace/TopBar.svelte";
  import SetupPanel from "./lib/components/workspace/SetupPanel.svelte";
  import { CbmHttpSource } from "./lib/graph/cbm-http";
  import {
    DEFAULT_CBM_BASE_URL,
    discoverCbmEndpoint,
    formatCbmEndpointError,
  } from "./lib/cbm-endpoint";
  import { ComputedSource } from "./lib/graph/computed";
  import { createHostFetch } from "./lib/cbm-host-fetch";
  import { graphSearchHits } from "./lib/graph/search";
  import {
    downloadSvg,
    svgFilename,
    svgMarkup,
  } from "./lib/graph/svg-export";
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
    formatGraphUrl,
    parseGraphUrl,
    type LayoutAlgorithm,
    type SourceKind,
  } from "./lib/graph/url-state";
  import { resolveShortcut } from "./lib/shortcuts";
  import type { PathCopyKind } from "./lib/path-location";
  import { writeClipboard } from "./lib/clipboard";
  import { copySymbolPath, jumpToLocation, type JumpRow } from "./lib/actions/symbol";
  import { openConfigPath } from "./lib/actions/config";
  import {
    fixFor,
    type SettingsFix,
  } from "./lib/settings-fix";
  import { refForProject } from "./lib/graph/ref-project";
  import { bundleForRef, normalizeEntry } from "./lib/graph/entry";
  import { fetchProjectsFor, fetchRootsFor } from "./lib/graph/loaders";
  import { progressLabel } from "./lib/graph/loading";
  import { rootsOverview } from "./lib/graph/overview";
  import { adjacentSibling, firstNeighbor } from "./lib/graph/navigation";
  import { ProgressController } from "./lib/state/progress";
  import {
    loadNodeHtmlRenderer,
    type NodeHtmlRenderer,
  } from "./lib/node-renderer";
  import { errorMessage } from "./lib/errors";
  import { applyGraphUrlToState, graphUrlParams } from "./lib/state/url-sync";
  interface GraphViewHandle {
    fit(): void;
    panScreen?(dx: number, dy: number): void;
    zoomBy?(factor: number): void;
    focusNode?(id: string): void;
    snapshotSvg?(): SVGSVGElement | null;
    copy?(): Promise<void>;
  }
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
  const progress = new ProgressController(codeGraph.current.load);

  const selectedNode = $derived(
    codeGraph.current.graph?.nodes.find((node) => node.id === codeGraph.current.selection.id) ?? codeGraph.current.selection.node,
  );

  const searchHits = $derived(graphSearchHits(codeGraph.current.graph, codeGraph.current.ui.search));
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
    if (!fix) return;
    if (fix.action === "restart-cbm") {
      try {
        await extensionApi.restartCbm();
        codeGraph.current.status.error = "";
        codeGraph.current.status.errorFix = null;
        codeGraph.current.status.graphError = "";
        codeGraph.current.status.graphFix = null;
        await reloadGraph();
      } catch (cause) {
        const detail = errorMessage(cause);
        console.error("[code-graph] restart cbm-http failed", cause);
        codeGraph.current.status.error = `Restart cbm-http failed: ${detail}`;
      }
      return;
    }
    try {
      await extensionApi.openSettings(fix.query);
    } catch (cause) {
      codeGraph.current.status.error = `Open settings failed: ${errorMessage(cause)}`;
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
    codeGraph.setup.loading.projects = true;
    try {
      codeGraph.setup.projects = await fetchProjectsFor(codeGraph.setup.source, (request) =>
        extensionApi.fetchCbm(request),
      );
    } catch (cause) {
      codeGraph.setup.projects = [];
      console.warn("[code-graph] could not load cbm projects", cause);
    } finally {
      codeGraph.setup.loading.projects = false;
    }
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
    if (typeof window === "undefined") return;
    const file = codeGraph.current.selection.node?.filePath ?? codeGraph.current.detail.symbol?.node.filePath;
    const line = codeGraph.current.selection.node?.startLine ?? codeGraph.current.detail.symbol?.node.startLine;
    const params = graphUrlParams(codeGraph, file && line ? { file, line } : null);
    // Keep embed-only knobs that are not part of the graph state.
    const currentParams = new URLSearchParams(window.location.search);
    for (const key of ["scale", "theme"]) {
      const value = currentParams.get(key);
      if (value) params.set(key, value);
    }
    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch) {
      window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
    }
  }

  function applyPendingLocation(next: GraphViewData): void {
    if (!codeGraph.current.navigation.pendingLocation) return;
    const match = next.nodes.find(
      (node) => node.filePath === codeGraph.current.navigation.pendingLocation?.file && node.startLine === codeGraph.current.navigation.pendingLocation?.line,
    );
    if (!match) return;
    codeGraph.current.navigation.pendingLocation = null;
    codeGraph.current.selection.id = match.id;
    codeGraph.current.selection.node = match;
    codeGraph.setup.entry = match.qualifiedName || match.id;
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

  function openConnection(qualifiedName: string): void {
    codeGraph.setup.entry = qualifiedName;
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
    const next = normalizeEntry(value);
    if (!next && value.trim()) return;
    codeGraph.setup.entry = next ?? "";
    codeGraph.setup.refProject = codeGraph.setup.project;
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
        focusSearch();
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
        void copyPath("relative");
        break;
      case "copy-relative-or-svg":
        if (jumpRow()) void copyPath("relative");
        else void copySvg();
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
    const next =
      direction === "sibling"
        ? adjacentSibling(graph, current.id, offset < 0 ? -1 : 1)
        : firstNeighbor(graph, current.id, direction);
    if (!next) return;
    void selectGraphNode(next);
    graphView?.focusNode?.(next.id);
  }

  function firstSearchHit(): GraphViewNode | undefined {
    if (!codeGraph.current.graph) return undefined;
    return codeGraph.current.graph.nodes.find((node) => searchHits.has(node.id));
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = firstSearchHit();
      if (hit) void selectGraphNode(hit);
    } else if (event.key === "Escape") {
      codeGraph.current.ui.search = "";
    }
  }

  function jumpRow(): JumpRow | null {
    return codeGraph.current.selection.node ?? codeGraph.current.detail.symbol?.node ?? null;
  }

  async function jump(row: JumpRow | null = jumpRow()): Promise<void> {
    await jumpToLocation(row, codeGraph.setup.project, extensionApi, codeGraph.current.status);
  }

  function jumpFromNode(node: GraphViewNode): void {
    codeGraph.current.selection.id = node.id;
    codeGraph.current.selection.node = node;
    void jump(node);
  }

  async function copyPath(copyKind: PathCopyKind): Promise<void> {
    await copySymbolPath(
      copyKind,
      jumpRow(),
      codeGraph.setup.workspaceRoot,
      codeGraph.current.status,
    );
  }

  async function copyTerminalArt(): Promise<void> {
    try {
      await graphView?.copy?.();
      codeGraph.current.status.export = "Copied character art";
    } catch (cause) {
      codeGraph.current.status.export = `Copy failed: ${errorMessage(cause)}`;
    }
  }

  function snapshotSvg(): SVGSVGElement | null {
    return graphView?.snapshotSvg?.() ?? null;
  }

  async function copySvg(): Promise<void> {
    const svg = snapshotSvg();
    if (!svg) {
      codeGraph.current.status.export = "Nothing to copy as SVG";
      return;
    }
    try {
      await writeClipboard(svgMarkup(svg));
      codeGraph.current.status.export = "Copied SVG";
    } catch (cause) {
      codeGraph.current.status.export = `Copy SVG failed: ${errorMessage(cause)}`;
    }
  }

  function exportSvg(): void {
    const svg = snapshotSvg();
    if (!svg) {
      codeGraph.current.status.export = "Nothing to export as SVG";
      return;
    }
    try {
      const filename = downloadSvg(svg, svgFilename(codeGraph.setup.entry));
      codeGraph.current.status.export = `Exported ${filename}`;
    } catch (cause) {
      codeGraph.current.status.export = `Export failed: ${errorMessage(cause)}`;
    }
  }
</script>

<main class="app">
  <TopBar
    project={codeGraph.setup.project}
    sourceLabel={codeGraph.setup.source === "computed" ? "computed" : codeGraph.setup.backend}
    setupOpen={codeGraph.current.ui.setupOpen}
    inspectorOpen={codeGraph.current.ui.inspectorOpen}
    search={codeGraph.current.ui.search}
    renderer={codeGraph.current.view.renderer}
    graphLoaded={Boolean(codeGraph.current.graph)}
    onsearch={(value) => (codeGraph.current.ui.search = value)}
    onsearchkeydown={onSearchKeydown}
    ontogglesetup={toggleSetup}
    ontoggledetails={toggleInspector}
    onfit={() => graphView?.fit()}
    oncopysvg={() => void copySvg()}
    onexportsvg={exportSvg}
    oncopyterminal={() => void copyTerminalArt()}
  />

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
        onclose={() => (codeGraph.current.ui.setupOpen = false)}
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
            <p class="sub">Choose a symbol entry above, or open Setup to pick a source.</p>
          </div>
        {/if}
      </div>

      <GraphFooter
        bind:entry={codeGraph.setup.entry}
        error={codeGraph.current.status.error}
        errorFix={codeGraph.current.status.errorFix}
        graphError={codeGraph.current.status.graphError}
        graphFix={codeGraph.current.status.graphFix}
        progress={codeGraph.current.load.progress}
        {loadStatus}
        {layoutStatus}
        graph={codeGraph.current.graph}
        {selectedNode}
        searchHitCount={searchHits.size}
        exportStatus={codeGraph.current.status.export}
        runtime={codeGraph.setup.runtime}
        sourceLabel={codeGraph.setup.source === "computed" ? "computed" : codeGraph.setup.backend}
        depth={codeGraph.current.view.depth}
        direction={codeGraph.current.view.direction}
        layout={codeGraph.current.view.layout}
        renderer={codeGraph.current.view.renderer}
        focusOnly={codeGraph.current.view.focusOnly}
        focusAvailable={Boolean(selectedNode)}
        roots={codeGraph.setup.roots}
        rootsLoading={codeGraph.setup.loading.roots}
        ondepth={onDepthChange}
        ondirection={changeDirection}
        onlayout={changeLayout}
        onrenderer={changeRenderer}
        onfocusonly={(value) => (codeGraph.current.view.focusOnly = value)}
        onentrycommit={onEntryCommit}
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
    </section>

    {#if codeGraph.current.ui.inspectorOpen}
      <InspectorPanel
        symbol={codeGraph.current.detail.symbol}
        focusNode={codeGraph.current.selection.node}
        loading={codeGraph.current.detail.loading}
        error={codeGraph.current.detail.error}
        jumpStatus={codeGraph.current.status.jump}
        jumpError={codeGraph.current.status.jumpError}
        copyStatus={codeGraph.current.status.copy}
        copyError={codeGraph.current.status.copyError}
        workspaceRoot={codeGraph.setup.workspaceRoot}
        onclose={() => (codeGraph.current.ui.inspectorOpen = false)}
        onjump={() => void jump()}
        oncopy={(copyKind) => void copyPath(copyKind)}
        onopen={openConnection}
      />
    {/if}
  </div>
</main>
