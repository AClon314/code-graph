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
    type FetchLike,
  } from "./lib/cbm-endpoint";
  import { ComputedSource } from "./lib/graph/computed";
  import { fetchRootCandidates, type RootCandidate } from "./lib/graph/roots";
  import { graphSvgStyle, SVG_THEME_VARIABLE_NAMES } from "./lib/graph/svg";
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
  interface GraphViewHandle {
    fit(): void;
    triggerExport?(): void;
    copy?(): Promise<void>;
  }
  type SettingsFix = { label: string; query: string };
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
  let setupOpen = $state(false);
  let inspectorOpen = $state(false);
  let detailLoading = $state(false);
  let searchField: HTMLElement | undefined;

  const selectedNode = $derived(
    graphData?.nodes.find((node) => node.id === selectedId) ?? focusNode,
  );

  const searchHits = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const hits = new Set<string>();
    if (!query || !graphData) return hits;
    for (const node of graphData.nodes) {
      if (
        node.name.toLowerCase().includes(query) ||
        node.qualifiedName.toLowerCase().includes(query)
      ) {
        hits.add(node.id);
      }
    }
    return hits;
  });

  const hostFetch: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    const response = await extensionApi.fetchCbm({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      method: init?.method === "POST" ? "POST" : "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    // Response forbids a body for these statuses; host bodies are always strings.
    const body =
      response.status === 204 || response.status === 205 || response.status === 304
        ? null
        : response.body;
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  };

  function currentSource(): GraphSource {
    return kind === "computed"
      ? computedSource
      : new CbmHttpSource({
          baseUrl: cbmBaseUrl,
          project,
          fetchImpl: runtime === "webview" ? hostFetch : undefined,
        });
  }

  function cbmUrlFix(): SettingsFix {
    return { label: "Open cbm URL setting", query: "codeGraph.cbmBaseUrl" };
  }

  function fixFor(value: unknown): SettingsFix {
    const text = message(value).toLowerCase();
    if (
      text.includes("project not found") ||
      text.includes("unknown project") ||
      text.includes("no such project")
    ) {
      return {
        label: "Open project setting",
        query: backend === "scip" ? "codeGraph.scipProject" : "codeGraph.cbmProject",
      };
    }
    if (text.includes("symbol") || text.includes("entry")) {
      return { label: "Open symbol entry setting", query: "codeGraph.symbolEntry" };
    }
    return cbmUrlFix();
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
      errorFix = fixFor(symbolResult.reason);
    }

    loading = false;
    error = problems.join("\n");

    if (symbolResult.status === "fulfilled") {
      await loadGraph(source, ref, id);
    } else {
      graphRequestId += 1;
      graphLoading = false;
      graphData = null;
      graphError = "";
    }
    syncUrl();
  }

  async function loadRoots(): Promise<void> {
    if (kind !== "cbm") {
      rootCandidates = [];
      rootsLoading = false;
      return;
    }
    rootsLoading = true;
    try {
      rootCandidates = await fetchRootCandidates(
        cbmBaseUrl,
        project,
        50,
        runtime === "webview" ? hostFetch : undefined,
      );
    } catch {
      rootCandidates = [];
    } finally {
      rootsLoading = false;
    }
  }

  async function ensureCbmEndpoint(): Promise<boolean> {
    if (runtime === "webview") return true;
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

  async function loadGraph(source: GraphSource, root: string, request: number): Promise<void> {
    const id = ++graphRequestId;
    graphLoading = true;
    graphError = "";
    graphFix = null;
    graphData = null;

    try {
      const next = await loadNeighborhood(source, project, root, { depth, direction });
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
      graphFix = fixFor(cause);
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
      const next = await loadNeighborhood(source, project, ref, { depth, direction });
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
      graphFix = fixFor(cause);
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

  async function setBackend(next: GraphBackend): Promise<void> {
    if (next === backend) return;
    backend = next;
    if (kind !== "cbm") return;

    try {
      const config = await extensionApi.getConfig(next);
      project = config.project;
      ref = config.symbolEntry;
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

  function toggleSetup(): void {
    setupOpen = !setupOpen;
    if (setupOpen) inspectorOpen = false;
  }

  function toggleInspector(): void {
    inspectorOpen = !inspectorOpen;
    if (inspectorOpen) setupOpen = false;
  }

  function focusSearch(): void {
    searchField?.focus();
    const input = searchField?.shadowRoot?.querySelector("input");
    input?.focus();
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

  function exportSvg(svg: SVGSVGElement): void {
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = exportStyles();
      clone.insertBefore(style, clone.firstChild);

      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`, xml], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `code-graph-${slug(ref)}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      exportStatus = `Exported ${link.download}`;
    } catch (cause) {
      exportStatus = `Export failed: ${message(cause)}`;
    }
  }

  function exportStyles(): string {
    const computed = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
    const variables = computed
      ? SVG_THEME_VARIABLE_NAMES.map(
          (name) => `${name}:${computed.getPropertyValue(name).trim()};`,
        ).join("")
      : "";

    return graphSvgStyle(variables);
  }

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLElement & { value: string }).value;
  }

  function message(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }

  function slug(value: string): string {
    return (
      value
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "call-graph"
    );
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
      />
      <button
        class="vscode-button load-button"
        type="button"
        onclick={() => void load()}
        disabled={loading}
        title="Load this symbol entry"
      >{loading ? "Loading…" : "Load"}</button>
    </div>

    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="searchbox">
      <span class="sr-only">Search graph</span>
      <vscode-textfield
        bind:this={searchField}
        value={search}
        oninput={(event: Event) => (search = textValue(event))}
        onkeydown={onSearchKeydown}
        role="searchbox"
        aria-label="Search graph"
        aria-keyshortcuts="/"
        tabindex="0"
        placeholder="Search graph"
        title="Search graph; Enter selects the first hit"
        spellcheck="false"
        autocomplete="off"
      ></vscode-textfield>
    </label>

    <div class="top-actions" aria-label="Graph actions">
      {#if graphData && renderer === "d3"}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={() => graphView?.fit()}
          title="Fit graph (F)"
          aria-keyshortcuts="F"
        >Fit</button>
      {/if}
      {#if renderer === "orchgraph"}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={() => void copyTerminalArt()}
          disabled={!graphData}
          title="Copy the character-art graph"
        >Copy</button>
      {:else}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={() => graphView?.triggerExport?.()}
          disabled={!graphData}
          title="Export SVG"
        >SVG</button>
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
        {runtime}
        {backend}
        onsource={setKind}
        onbackend={setBackend}
        onproject={(value) => (project = value)}
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
              onexport={exportSvg}
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
            <vscode-single-select
              class="depth-select"
              value={String(depth)}
              aria-label="Neighborhood depth"
              onchangecapture={(event: Event) => changeDepth(textValue(event))}
            >
              <vscode-option value="1">1</vscode-option>
              <vscode-option value="2">2</vscode-option>
              <vscode-option value="3">3</vscode-option>
            </vscode-single-select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="view-control" title="Edge direction">
            <span>edges</span>
            <vscode-single-select
              class="direction-select"
              value={direction}
              aria-label="Edge direction"
              onchangecapture={(event: Event) => changeDirection(textValue(event))}
            >
              <vscode-option value="both">both</vscode-option>
              <vscode-option value="callers">callers</vscode-option>
              <vscode-option value="callees">callees</vscode-option>
            </vscode-single-select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="view-control" title="Graph renderer">
            <span>view</span>
            <vscode-single-select
              class="renderer-select"
              value={renderer}
              aria-label="Graph renderer"
              onchangecapture={(event: Event) => changeRenderer(textValue(event))}
            >
              <vscode-option value="d3">D3</vscode-option>
              <vscode-option value="orchgraph">orchgraph</vscode-option>
            </vscode-single-select>
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
