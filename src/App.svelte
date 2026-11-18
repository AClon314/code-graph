<script lang="ts">
  import { onMount } from "svelte";

  import GraphView from "./lib/components/GraphView.svelte";
  import OrchgraphView from "./lib/components/OrchgraphView.svelte";
  import InspectorPanel from "./lib/components/workspace/InspectorPanel.svelte";
  import RootEntryField from "./lib/components/workspace/RootEntryField.svelte";
  import SetupPanel from "./lib/components/workspace/SetupPanel.svelte";
  import { CbmHttpSource } from "./lib/graph/cbm-http";
  import {
    DEFAULT_CBM_BASE_URL,
    discoverCbmEndpoint,
    formatCbmEndpointError,
  } from "./lib/cbm-endpoint";
  import { ComputedSource } from "./lib/graph/computed";
  import { createHostFetch } from "./lib/cbm-host-fetch";
  import { type RootCandidate } from "./lib/graph/roots";
  import { graphSearchHits } from "./lib/graph/search";
  import {
    downloadSvg,
    svgFilename,
    svgMarkup,
  } from "./lib/graph/svg-export";
  import {
    loadNeighborhood,
    type NeighborhoodDirection,
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
    SOURCE_DEFAULTS,
    formatGraphUrl,
    parseGraphUrl,
    type Depth,
    type GraphRenderer,
    type SourceKind,
  } from "./lib/graph/url-state";
  import { resolveShortcut } from "./lib/shortcuts";
  import { copyPathText, pathFormats, type PathCopyKind } from "./lib/path-location";
  import { writeClipboard } from "./lib/clipboard";
  import {
    cbmUrlFix,
    fixFor,
    type SettingsFix,
  } from "./lib/settings-fix";
  import { refForProject } from "./lib/graph/ref-project";
  import { bundleForRef, normalizeEntry } from "./lib/graph/entry";
  import { fetchProjectsFor, fetchRootsFor } from "./lib/graph/loaders";
  interface GraphViewHandle {
    fit(): void;
    snapshotSvg?(): SVGSVGElement | null;
    copy?(): Promise<void>;
  }
  type JumpRow = {
    filePath?: string;
    startLine?: number;
    startColumn?: number;
    qualifiedName?: string;
    name?: string;
  };

  const computedSource = new ComputedSource();

  let kind = $state<SourceKind>("computed");
  let project = $state("demo");
  let ref = $state("demo.src.features.useAlias");
  let refProject = $state("demo");
  let cbmBaseUrl = $state("http://127.0.0.1:9749");
  let workspaceRoot = $state("");
  let runtime = $state(extensionApi.runtime);
  let backend = $state<GraphBackend>("cbm");
  let symbol = $state<SymbolBundle | null>(null);
  let error = $state("");
  let errorFix = $state<SettingsFix | null>(null);
  let loading = $state(false);
  let requestId = 0;

  let depth = $state<Depth>(2);
  let direction = $state<NeighborhoodDirection>("both");
  let graphData = $state<GraphViewData | null>(null);
  let graphLoading = $state(false);
  let graphError = $state("");
  let graphFix = $state<SettingsFix | null>(null);
  let graphRequestId = 0;
  let selectedId = $state("");
  let focusNode = $state<GraphViewNode | null>(null);
  let search = $state("");
  let detailError = $state("");
  let detailRequestId = 0;
  let jumpStatus = $state("");
  let jumpError = $state("");
  let copyStatus = $state("");
  let copyError = $state("");
  let exportStatus = $state("");
  let renderer = $state<GraphRenderer>("d3");
  let graphView = $state<GraphViewHandle>();
  let pendingLocation: { file: string; line: number } | null = null;
  let rootCandidates = $state<RootCandidate[]>([]);
  let rootsLoading = $state(false);
  let projectCandidates = $state<string[]>([]);
  let projectsLoading = $state(false);
  let setupOpen = $state(false);
  let inspectorOpen = $state(false);
  let detailLoading = $state(false);
  let searchField: HTMLInputElement | undefined;

  const selectedNode = $derived(
    graphData?.nodes.find((node) => node.id === selectedId) ?? focusNode,
  );

  const searchHits = $derived(graphSearchHits(graphData, search));
  const hostFetch = createHostFetch(extensionApi.fetchCbm);

  function currentSource(): GraphSource {
    return kind === "computed"
      ? computedSource
      : new CbmHttpSource({
          baseUrl: cbmBaseUrl,
          project,
          fetchImpl: runtime === "webview" ? hostFetch : undefined,
        });
  }

  async function openFix(fix: SettingsFix | null): Promise<void> {
    if (!fix) return;
    try {
      await extensionApi.openSettings(fix.query);
    } catch (cause) {
      error = `Open settings failed: ${message(cause)}`;
    }
  }

  async function load(): Promise<void> {
    const id = ++requestId;
    loading = true;
    error = "";
    errorFix = null;
    graphFix = null;
    detailError = "";
    detailLoading = false;
    detailRequestId += 1;
    jumpStatus = "";
    jumpError = "";
    copyStatus = "";
    copyError = "";
    exportStatus = "";

    if (kind === "cbm" && !(await ensureCbmEndpoint())) {
      loading = false;
      symbol = null;
      graphData = null;
      graphLoading = false;
      graphError = "";
      rootCandidates = [];
      syncUrl();
      return;
    }
    void loadRoots();
    void loadProjects();
    refProject = project;

    const entry = ref.trim();
    if (!entry) {
      loading = false;
      symbol = null;
      error = "Enter a symbol name or #id to load a graph.";
      errorFix = null;
      graphData = null;
      graphLoading = false;
      graphError = "";
      syncUrl();
      return;
    }

    const source = currentSource();
    const symbolResult = await source.symbol(project, ref).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    if (id !== requestId) return;

    const problems: string[] = [];

    if (symbolResult.status === "fulfilled") {
      symbol = symbolResult.value;
      selectedId = symbol.node.qualifiedName;
      focusNode = null;
    } else {
      symbol = null;
      selectedId = "";
      focusNode = null;
      problems.push(`symbol: ${message(symbolResult.reason)}`);
      errorFix = fixFor(symbolResult.reason, backend);
    }

    loading = false;
    error = problems.join("\n");

    if (symbolResult.status === "fulfilled") {
      await loadGraph(source, ref, id, symbolResult.value);
    } else {
      graphRequestId += 1;
      graphLoading = false;
      graphData = null;
      graphError = "";
    }
    syncUrl();
  }

  async function loadRoots(): Promise<void> {
    rootsLoading = true;
    try {
      rootCandidates = await fetchRootsFor(
        kind,
        cbmBaseUrl,
        project,
        runtime === "webview" ? hostFetch : undefined,
      );
    } catch {
      rootCandidates = [];
    } finally {
      rootsLoading = false;
    }
  }

  async function loadProjects(): Promise<void> {
    projectsLoading = true;
    try {
      projectCandidates = await fetchProjectsFor(kind, (request) =>
        extensionApi.fetchCbm(request),
      );
    } catch (cause) {
      projectCandidates = [];
      console.warn("[code-graph] could not load cbm projects", cause);
    } finally {
      projectsLoading = false;
    }
  }

  async function ensureCbmEndpoint(): Promise<boolean> {
    // Browser web uses Vite's same-origin /api proxy; there is no node-side
    // port discovery to run there.
    if (runtime === "webview" || runtime === "browser") return true;
    try {
      const result = await discoverCbmEndpoint({
        candidates: [cbmBaseUrl, DEFAULT_CBM_BASE_URL],
      });
      cbmBaseUrl = result.baseUrl;
      return true;
    } catch (cause) {
      error = formatCbmEndpointError(cause);
      errorFix = cbmUrlFix();
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
    graphLoading = true;
    graphError = "";
    graphFix = null;
    graphData = null;

    try {
      const next = await loadNeighborhood(source, project, root, {
        depth,
        direction,
        rootBundle,
      });
      if (id !== graphRequestId || request !== requestId) return;
      graphData = next;
      if (!next.nodes.some((node) => node.id === selectedId)) {
        const rootNode = next.nodes[0];
        selectedId = rootNode?.id ?? next.root;
        focusNode = null;
      }
      applyPendingLocation(next);
    } catch (cause) {
      if (id !== graphRequestId || request !== requestId) return;
      graphError = message(cause);
      graphFix = fixFor(cause, backend);
    } finally {
      if (id === graphRequestId) graphLoading = false;
    }
  }

  async function reloadGraph(): Promise<void> {
    const id = ++graphRequestId;
    graphLoading = true;
    graphError = "";
    graphFix = null;
    exportStatus = "";

    try {
      const source = currentSource();
      const rootBundle = bundleForRef(symbol, ref);
      const next = await loadNeighborhood(source, project, ref, {
        depth,
        direction,
        rootBundle,
      });
      if (id !== graphRequestId) return;
      graphData = next;
      if (!next.nodes.some((node) => node.id === selectedId)) {
        const rootNode = next.nodes[0];
        selectedId = rootNode?.id ?? next.root;
        focusNode = null;
      }
    } catch (cause) {
      if (id !== graphRequestId) return;
      graphData = null;
      graphError = message(cause);
      graphFix = fixFor(cause, backend);
    } finally {
      if (id === graphRequestId) graphLoading = false;
    }
  }

  onMount(() => {
    let disposed = false;

    void (async () => {
      try {
        const config = await extensionApi.getConfig();
        if (disposed) return;
        runtime = extensionApi.runtime;
        backend = config.backend;
        if (config.source === "computed" || config.source === "cbm") kind = config.source;
        cbmBaseUrl = config.cbmBaseUrl;
        workspaceRoot = config.workspaceRoot;
        if (config.project) project = config.project;
        if (config.symbolEntry) ref = config.symbolEntry;
      } catch (cause) {
        error = formatCbmEndpointError(cause);
        errorFix = cbmUrlFix();
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
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onGlobalKeydown);
    };
  });

  function applyUrl(): void {
    if (typeof window === "undefined") return;
    const next = parseGraphUrl(window.location.search, {
      source: kind,
      project,
      symbol: ref,
      renderer,
      depth,
      direction,
    });
    kind = next.source;
    project = next.project;
    ref = next.symbol;
    refProject = next.project;
    renderer = next.renderer;
    depth = next.depth;
    direction = next.direction;
    pendingLocation = next.location;
  }

  function onPopState(): void {
    applyUrl();
    void load();
  }

  function syncUrl(): void {
    if (typeof window === "undefined") return;
    const file = focusNode?.filePath ?? symbol?.node.filePath;
    const line = focusNode?.startLine ?? symbol?.node.startLine;
    const params = new URLSearchParams(
      formatGraphUrl(
        { source: kind, project, symbol: ref, renderer, depth, direction },
        file && line ? { file, line } : null,
      ),
    );
    // Keep embed-only knobs that are not part of the graph state.
    const current = new URLSearchParams(window.location.search);
    for (const key of ["scale", "theme"]) {
      const value = current.get(key);
      if (value) params.set(key, value);
    }
    const search = `?${params.toString()}`;
    if (window.location.search !== search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
    }
  }

  function applyPendingLocation(next: GraphViewData): void {
    if (!pendingLocation) return;
    const match = next.nodes.find(
      (node) => node.filePath === pendingLocation?.file && node.startLine === pendingLocation?.line,
    );
    if (!match) return;
    pendingLocation = null;
    selectedId = match.id;
    focusNode = match;
    ref = match.qualifiedName || match.id;
    void selectGraphNode(match);
  }

  async function setKind(next: SourceKind): Promise<void> {
    kind = next;
    if (next === "computed") {
      const defaults = SOURCE_DEFAULTS.computed;
      project = defaults.project;
      ref = defaults.symbol;
    } else {
      try {
        const config = await extensionApi.getConfig(backend);
        project = config.project;
        ref = config.symbolEntry;
      } catch (cause) {
        error = `Backend setup failed: ${message(cause)}`;
        return;
      }
    }
    await load();
  }

  function setProject(value: string, commit = false): void {
    if (value !== project) {
      ref = refForProject(ref, refProject, value);
      project = value;
    }
    refProject = value;
    if (commit) void load();
  }

  async function setBackend(next: GraphBackend): Promise<void> {
    if (next === backend) return;
    backend = next;
    if (kind !== "cbm") return;
    try {
      const config = await extensionApi.getConfig(next);
      if (runtime === "browser") {
        // The web shell has no per-backend project settings. Preserve the
        // project the user is looking at and apply the cbm/scip suffix.
        const base = project.endsWith("-scip") ? project.slice(0, -5) : project;
        const nextProject = next === "scip" ? `${base}-scip` : base;
        ref = refForProject(ref, refProject, nextProject);
        refProject = nextProject;
        project = nextProject;
      } else {
        project = config.project;
        ref = config.symbolEntry;
        refProject = config.project;
      }
      cbmBaseUrl = config.cbmBaseUrl;
      workspaceRoot = config.workspaceRoot;
      await load();
    } catch (cause) {
      error = `Backend switch failed: ${message(cause)}`;
    }
  }

  function openConnection(qualifiedName: string): void {
    ref = qualifiedName;
    inspectorOpen = true;
    setupOpen = false;
    syncUrl();
    void load();
  }

  function changeRenderer(value: string): void {
    if (value !== "d3" && value !== "orchgraph") return;
    renderer = value;
    syncUrl();
  }

  function changeDepth(value: string): void {
    const next = Number(value);
    if (next !== 1 && next !== 2 && next !== 3) return;
    depth = next;
    syncUrl();
    void reloadGraph();
  }

  function changeDirection(value: string): void {
    if (value !== "both" && value !== "callers" && value !== "callees") return;
    direction = value;
    syncUrl();
    void reloadGraph();
  }

  async function selectGraphNode(node: GraphViewNode): Promise<void> {
    selectedId = node.id;
    focusNode = node;
    ref = node.qualifiedName || node.id;
    inspectorOpen = true;
    setupOpen = false;
    syncUrl();
    symbol = null;
    detailError = "";
    detailLoading = true;
    jumpStatus = "";
    jumpError = "";
    copyStatus = "";
    copyError = "";
    exportStatus = "";

    const id = ++detailRequestId;
    try {
      const bundle = await currentSource().symbol(project, node.qualifiedName || node.id);
      if (id !== detailRequestId) return;
      symbol = bundle;
    } catch (cause) {
      if (id !== detailRequestId) return;
      symbol = null;
      detailError = `Could not load symbol details: ${message(cause)}`;
    } finally {
      if (id === detailRequestId) detailLoading = false;
    }
  }

  function onEntryCommit(value: string): void {
    const next = normalizeEntry(value);
    if (!next) return;
    ref = next;
    refProject = project;
    void load();
  }

  function toggleSetup(): void {
    setupOpen = !setupOpen;
    if (setupOpen) {
      inspectorOpen = false;
      if (kind === "cbm" && projectCandidates.length === 0) {
        void loadProjects();
      }
    }
  }

  function toggleInspector(): void {
    inspectorOpen = !inspectorOpen;
    if (inspectorOpen) setupOpen = false;
  }

  function focusSearch(): void {
    searchField?.focus();
  }

  function onGlobalKeydown(event: KeyboardEvent): void {
    const action = resolveShortcut(event, { setupOpen, inspectorOpen });
    if (!action) return;
    event.preventDefault();

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
      case "close-setup":
        setupOpen = false;
        break;
      case "close-details":
        inspectorOpen = false;
        break;
    }
  }

  function firstSearchHit(): GraphViewNode | undefined {
    if (!graphData) return undefined;
    return graphData.nodes.find((node) => searchHits.has(node.id));
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = firstSearchHit();
      if (hit) void selectGraphNode(hit);
    } else if (event.key === "Escape") {
      search = "";
    }
  }

  function jumpRow(): JumpRow | null {
    return focusNode ?? symbol?.node ?? null;
  }

  async function jump(row: JumpRow | null = jumpRow()): Promise<void> {
    jumpStatus = "";
    jumpError = "";
    if (!row?.filePath) {
      jumpError = "This symbol has no file path to jump to.";
      return;
    }

    const line = row.startLine ?? 1;
    const column = row.startColumn ?? 1;
    jumpStatus = `Opening ${row.filePath}:${line}:${column}…`;
    try {
      await extensionApi.openLocation({
        project,
        path: row.filePath,
        line,
        column,
        symbol: row.qualifiedName ?? row.name,
      });
      jumpStatus = `Opened ${row.filePath}:${line}:${column}`;
    } catch (cause) {
      jumpStatus = "";
      jumpError = `Open failed: ${message(cause)}`;
    }
  }

  function jumpFromNode(node: GraphViewNode): void {
    selectedId = node.id;
    focusNode = node;
    void jump(node);
  }

  async function copyPath(kind: PathCopyKind): Promise<void> {
    copyStatus = "";
    copyError = "";
    const row = jumpRow();
    if (!row?.filePath) {
      copyError = "This symbol has no file path to copy.";
      return;
    }

    const text = copyPathText(
      kind,
      pathFormats(row.filePath, workspaceRoot),
      row.startLine,
      row.startColumn,
    );
    if (!text) {
      copyError =
        kind === "absolute" || kind === "both"
          ? "Absolute path unavailable: no workspace root."
          : "Relative path unavailable for this file.";
      return;
    }

    try {
      await writeClipboard(text);
      copyStatus = kind === "both" ? "Copied relative + absolute paths" : `Copied ${kind} path`;
    } catch (cause) {
      copyError = `Copy failed: ${message(cause)}`;
    }
  }

  async function copyTerminalArt(): Promise<void> {
    try {
      await graphView?.copy?.();
      exportStatus = "Copied character art";
    } catch (cause) {
      exportStatus = `Copy failed: ${message(cause)}`;
    }
  }

  function snapshotSvg(): SVGSVGElement | null {
    return graphView?.snapshotSvg?.() ?? null;
  }

  async function copySvg(): Promise<void> {
    const svg = snapshotSvg();
    if (!svg) {
      exportStatus = "Nothing to copy as SVG";
      return;
    }
    try {
      await writeClipboard(svgMarkup(svg));
      exportStatus = "Copied SVG";
    } catch (cause) {
      exportStatus = `Copy SVG failed: ${message(cause)}`;
    }
  }

  function exportSvg(): void {
    const svg = snapshotSvg();
    if (!svg) {
      exportStatus = "Nothing to export as SVG";
      return;
    }
    try {
      const filename = downloadSvg(svg, svgFilename(ref));
      exportStatus = `Exported ${filename}`;
    } catch (cause) {
      exportStatus = `Export failed: ${message(cause)}`;
    }
  }

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLElement & { value: string }).value;
  }

  function message(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }
</script>

<main class="app">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">◈</span>
      <div class="brand-copy">
        <h1>Code Graph</h1>
        <button
          class="context-chip"
          type="button"
          aria-expanded={setupOpen}
          title="Project and source setup"
          onclick={toggleSetup}
        >
          {project}<span class="context-kind">{kind === "computed" ? "computed" : backend}</span>
        </button>
      </div>
    </div>

    <div class="entry-bar">
      <RootEntryField
        bind:value={ref}
        roots={rootCandidates}
        loading={rootsLoading}
        label="Symbol entry (qualified name or #id)"
        oncommit={onEntryCommit}
      />
    </div>

    <label class="searchbox">
      <span class="sr-only">Search graph</span>
      <input
        type="search"
        class="search-input"
        bind:this={searchField}
        value={search}
        oninput={(event: Event) => (search = textValue(event))}
        onkeydown={onSearchKeydown}
        aria-label="Search graph"
        aria-keyshortcuts="/"
        tabindex="0"
        placeholder="Search graph"
        title="Search graph; Enter selects the first hit"
        spellcheck="false"
        autocomplete="off"
      />
    </label>

    <div class="top-actions" aria-label="Graph actions">
      {#if renderer === "d3"}
        {#if graphData}
          <button
            class="vscode-button secondary tool-button"
            type="button"
            onclick={() => graphView?.fit()}
            title="Fit graph (F)"
            aria-keyshortcuts="F"
          >Fit</button>
        {/if}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={() => void copySvg()}
          disabled={!graphData}
          title="Copy SVG to clipboard"
        >Copy SVG</button>
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={exportSvg}
          disabled={!graphData}
          title="Download SVG"
        >Export SVG</button>
      {:else}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={() => void copyTerminalArt()}
          disabled={!graphData}
          title="Copy the character-art graph"
        >Copy</button>
      {/if}
      <button
        class="vscode-button secondary tool-button"
        class:active={inspectorOpen}
        type="button"
        aria-pressed={inspectorOpen}
        aria-keyshortcuts="D"
        title="Toggle symbol details (D)"
        onclick={toggleInspector}
      >Details</button>
      <button
        class="vscode-button secondary tool-button"
        class:active={setupOpen}
        type="button"
        aria-pressed={setupOpen}
        aria-keyshortcuts="S"
        title="Toggle source and project setup (S)"
        onclick={toggleSetup}
      >Setup</button>
    </div>
  </header>

  <div class="workbench">
    {#if setupOpen}
      <SetupPanel
        {kind}
        {project}
        projects={projectCandidates}
        {projectsLoading}
        {runtime}
        {backend}
        onsource={setKind}
        onbackend={setBackend}
        onproject={(value) => setProject(value)}
        onprojectcommit={(value) => setProject(value, true)}
        onclose={() => (setupOpen = false)}
      />
    {/if}

    <section class="graph-stage" aria-label="Call graph">
      <div class="graph-frame">
        {#if graphData}
          {#if renderer === "orchgraph"}
            <OrchgraphView
              bind:this={graphView}
              data={graphData}
              {selectedId}
              {searchHits}
              onselect={(node) => void selectGraphNode(node)}
              onjump={jumpFromNode}
            />
          {:else}
            <GraphView
              bind:this={graphView}
              data={graphData}
              {selectedId}
              {searchHits}
              onselect={(node) => void selectGraphNode(node)}
              onjump={jumpFromNode}
            />
          {/if}
        {:else}
          <div class="graph-empty">
            <p class="graph-empty-title">
              {graphLoading || loading ? "Loading neighborhood…" : "No graph loaded"}
            </p>
            <p class="sub">Choose a symbol entry above, or open Setup to pick a source.</p>
          </div>
        {/if}
      </div>

      {#if graphLoading && graphData}
        <div class="graph-busy" role="status">Updating graph…</div>
      {/if}

      {#if error || graphError}
        <div class="canvas-alerts">
          {#if error}
            <div class="canvas-alert" role="alert">
              <p class="error compact">{error}</p>
              {#if errorFix}
                <button
                  class="vscode-button secondary fix-button"
                  type="button"
                  onclick={() => void openFix(errorFix)}
                >{errorFix.label}</button>
              {/if}
            </div>
          {/if}
          {#if graphError}
            <div class="canvas-alert" role="alert">
              <p class="error compact">Neighborhood failed: {graphError}</p>
              {#if graphFix}
                <button
                  class="vscode-button secondary fix-button"
                  type="button"
                  onclick={() => void openFix(graphFix)}
                >{graphFix.label}</button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <footer class="statusbar">
        <div class="status-left">
          {#if graphData}
            <span>{graphData.nodes.length} nodes · {graphData.edges.length} edges</span>
            {#if graphData.truncated}<span class="badge">truncated</span>{/if}
            {#if selectedNode}
              <span class="status-selection" title={selectedNode.qualifiedName}>{selectedNode.name}</span>
            {/if}
          {:else}
            <span>{loading || graphLoading ? "Loading…" : "No graph"}</span>
          {/if}
        </div>

        <div class="view-controls" aria-label="View options">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="view-control" title="Neighborhood depth">
            <span>depth</span>
            <select
              class="depth-select"
              value={String(depth)}
              aria-label="Neighborhood depth"
              onchange={(event: Event) => changeDepth(textValue(event))}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="view-control" title="Edge direction">
            <span>edges</span>
            <select
              class="direction-select"
              value={direction}
              aria-label="Edge direction"
              onchange={(event: Event) => changeDirection(textValue(event))}
            >
              <option value="both">both</option>
              <option value="callers">callers</option>
              <option value="callees">callees</option>
            </select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="view-control" title="Graph renderer">
            <span>view</span>
            <select
              class="renderer-select"
              value={renderer}
              aria-label="Graph renderer"
              onchange={(event: Event) => changeRenderer(textValue(event))}
            >
              <option value="d3">D3</option>
              <option value="orchgraph">orchgraph</option>
            </select>
          </label>
        </div>

        <div class="status-right">
          {#if searchHits.size > 0}
            <span>{searchHits.size} {searchHits.size === 1 ? "hit" : "hits"}</span>
          {/if}
          {#if exportStatus}<span class="status-message" title={exportStatus}>{exportStatus}</span>{/if}
          <span class="runtime">{runtime} · {kind === "computed" ? "computed" : backend}</span>
        </div>
      </footer>
    </section>

    {#if inspectorOpen}
      <InspectorPanel
        {symbol}
        {focusNode}
        loading={detailLoading}
        error={detailError}
        {jumpStatus}
        {jumpError}
        {copyStatus}
        {copyError}
        {workspaceRoot}
        onclose={() => (inspectorOpen = false)}
        onjump={() => void jump()}
        oncopy={(kind) => void copyPath(kind)}
        onopen={openConnection}
      />
    {/if}
  </div>
</main>
