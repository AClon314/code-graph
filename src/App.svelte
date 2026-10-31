<script lang="ts">
  import { onMount } from "svelte";

  import GraphView from "./lib/components/GraphView.svelte";
  import OrchgraphView from "./lib/components/OrchgraphView.svelte";
  import { CbmHttpSource } from "./lib/graph/cbm-http";
  import { MockSource } from "./lib/graph/mock";
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

  type SourceKind = "mock" | "cbm";
  type GraphRenderer = "d3" | "orchgraph";
  type Depth = 1 | 2 | 3;
  interface GraphViewHandle {
    fit(): void;
    triggerExport?(): void;
    copy?(): Promise<void>;
  }
  type JumpRow = {
    filePath?: string;
    startLine?: number;
    qualifiedName?: string;
    name?: string;
  };

  const mock = new MockSource();

  let kind = $state<SourceKind>("mock");
  let project = $state("demo");
  let ref = $state("demo.src.features.useAlias");
  let cbmBaseUrl = $state("http://127.0.0.1:9749");
  let runtime = $state(extensionApi.runtime);
  let backend = $state<GraphBackend>("cbm");
  let symbol = $state<SymbolBundle | null>(null);
  let error = $state("");
  let loading = $state(false);
  let requestId = 0;

  let depth = $state<Depth>(2);
  let direction = $state<NeighborhoodDirection>("both");
  let graphData = $state<GraphViewData | null>(null);
  let graphLoading = $state(false);
  let graphError = $state("");
  let graphRequestId = 0;
  let selectedId = $state("");
  let focusNode = $state<GraphViewNode | null>(null);
  let search = $state("");
  let detailError = $state("");
  let detailRequestId = 0;
  let jumpStatus = $state("");
  let jumpError = $state("");
  let exportStatus = $state("");
  let renderer = $state<GraphRenderer>("d3");
  let graphView = $state<GraphViewHandle>();
  let pendingLocation: { file: string; line: number } | null = null;

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

  function currentSource(): GraphSource {
    return kind === "mock"
      ? mock
      : new CbmHttpSource({ baseUrl: cbmBaseUrl, project });
  }

  async function load(): Promise<void> {
    const id = ++requestId;
    loading = true;
    error = "";
    detailError = "";
    jumpStatus = "";
    jumpError = "";
    exportStatus = "";

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

  async function loadGraph(source: GraphSource, root: string, request: number): Promise<void> {
    const id = ++graphRequestId;
    graphLoading = true;
    graphError = "";
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
    } finally {
      if (id === graphRequestId) graphLoading = false;
    }
  }

  async function reloadGraph(): Promise<void> {
    const id = ++graphRequestId;
    graphLoading = true;
    graphError = "";
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
        if (config.source === "mock" || config.source === "cbm") kind = config.source;
        cbmBaseUrl = config.cbmBaseUrl;
        if (config.project) project = config.project;
        if (config.symbol) ref = config.symbol;
      } catch (cause) {
        console.warn("code-graph: could not read extension configuration", cause);
      }

      if (disposed) return;
      applyUrl();
      void load();
    })();

    window.addEventListener("popstate", onPopState);
    return () => {
      disposed = true;
      window.removeEventListener("popstate", onPopState);
    };
  });

  function applyUrl(): void {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    if (source === "mock" || source === "cbm") kind = source;
    if (source === "cbm") {
      project = params.get("project") ?? "fixture-hard-scip";
      ref = params.get("symbol") ?? "fixture-hard-scip.src.features.useAlias";
    } else if (source === "mock") {
      project = params.get("project") ?? "demo";
      ref = params.get("symbol") ?? "demo.src.features.useAlias";
    } else {
      if (params.get("project")) project = params.get("project")!;
      if (params.get("symbol")) ref = params.get("symbol")!;
    }
    const nextRenderer = params.get("renderer");
    if (nextRenderer === "d3" || nextRenderer === "orchgraph") renderer = nextRenderer;
    const nextDepth = Number(params.get("depth"));
    if (nextDepth === 1 || nextDepth === 2 || nextDepth === 3) depth = nextDepth;
    const nextDirection = params.get("direction");
    if (nextDirection === "both" || nextDirection === "callers" || nextDirection === "callees") {
      direction = nextDirection;
    }
    const file = params.get("file");
    const line = Number(params.get("line"));
    pendingLocation = file && Number.isFinite(line) && line > 0 ? { file, line } : null;
  }

  function onPopState(): void {
    applyUrl();
    void load();
  }

  function syncUrl(): void {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("source", kind);
    params.set("project", project);
    params.set("symbol", ref);
    params.set("renderer", renderer);
    params.set("depth", String(depth));
    params.set("direction", direction);
    const file = focusNode?.filePath ?? symbol?.node.filePath;
    const line = focusNode?.startLine ?? symbol?.node.startLine;
    if (file) params.set("file", file);
    if (line) params.set("line", String(line));
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

  function setKind(next: SourceKind): void {
    kind = next;
    if (next === "mock") {
      project = "demo";
      ref = "demo.src.features.useAlias";
    } else {
      project = "fixture-hard-scip";
      ref = "fixture-hard-scip.src.features.useAlias";
    }
    void load();
  }

  function openConnection(qualifiedName: string): void {
    ref = qualifiedName;
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
    syncUrl();
    detailError = "";
    jumpStatus = "";
    jumpError = "";
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
    jumpStatus = `Opening ${row.filePath}:${line}…`;
    try {
      await extensionApi.openLocation({
        project,
        path: row.filePath,
        line,
        symbol: row.qualifiedName ?? row.name,
      });
      jumpStatus = `Opened ${row.filePath}:${line}`;
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
    const names = [
      "--bg",
      "--panel",
      "--line",
      "--text",
      "--muted",
      "--accent",
      "--graph-bg",
      "--node-bg",
      "--node-line",
      "--edge",
      "--hit",
      "--font-code",
    ];
    const variables = computed
      ? names.map((name) => `${name}:${computed.getPropertyValue(name).trim()};`).join("")
      : "";

    return `
:root { color-scheme: light dark; ${variables} }
.graph-svg { background: var(--graph-bg, #ffffff); }
.has-search-hits .orchgraph-node:not(.is-search-hit) { opacity: .35; }
.orchgraph-edge { fill: none; stroke: var(--edge, #888888); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.orchgraph-arrow { fill: var(--edge, #888888); }
.orchgraph-node rect { fill: var(--node-bg, #ffffff); stroke: var(--node-line, #999999); stroke-width: 1.25; }
.orchgraph-node-kind { fill: var(--muted, #666666); font: 600 9px var(--font-code, ui-monospace, monospace); letter-spacing: .04em; text-transform: uppercase; }
.orchgraph-node-label { fill: var(--text, #111111); font: 600 14px var(--font-code, ui-monospace, monospace); }
.orchgraph-node-detail { fill: var(--muted, #666666); font: 10px var(--font-code, ui-monospace, monospace); }
.orchgraph-node-state { fill: var(--muted, #666666); font: 700 12px var(--font-code, ui-monospace, monospace); }
.orchgraph-edge-label { fill: var(--muted, #666666); font: 10px var(--font-code, ui-monospace, monospace); text-anchor: middle; }
.orchgraph-node.is-search-hit rect { stroke: var(--hit, #c98a00); stroke-width: 2; }
.orchgraph-node.is-selected rect { stroke: var(--accent, #176b5a); stroke-width: 2.5; }
`.trim();
  }

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLElement & { value: string }).value;
  }

  function location(filePath?: string, line?: number): string {
    if (!filePath) return "unknown location";
    return line ? `${filePath}:${line}` : filePath;
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
  <header>
    <h1>code-graph</h1>
    <div class="header-actions">
      <div class="switcher" aria-label="Graph source">
                <button
          class="vscode-button"
          class:secondary={kind !== "mock"}
          type="button"
          onclick={() => setKind("mock")}
        >Mock</button>
                <button
          class="vscode-button"
          class:secondary={kind !== "cbm"}
          type="button"
          onclick={() => setKind("cbm")}
        >cbm HTTP</button>
      </div>
      <span class="runtime">{runtime} · {backend}</span>
    </div>
  </header>

  <section class="controls" aria-label="Query">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label>
      Project
      <vscode-textfield
        value={project}
        spellcheck="false"
        oninput={(event: Event) => (project = textValue(event))}
      ></vscode-textfield>
    </label>
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label>
      Symbol (qn or #id)
      <vscode-textfield
        value={ref}
        spellcheck="false"
        oninput={(event: Event) => (ref = textValue(event))}
      ></vscode-textfield>
    </label>
        <button class="vscode-button" type="button" onclick={() => void load()} disabled={loading}>
      {loading ? "Loading…" : "Load"}
    </button>
  </section>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="board">
    <div class="graph-column">
      <section class="card graph-card" aria-label="Call graph">
        <div class="graph-toolbar">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="search-field">
            Search graph
            <vscode-textfield
              value={search}
              oninput={(event: Event) => (search = textValue(event))}
              onkeydown={onSearchKeydown}
              role="searchbox"
              tabindex="0"
              placeholder="name or qualified name"
              spellcheck="false"
              autocomplete="off"
            ></vscode-textfield>
          </label>
          <!-- vscode-single-select dispatches a non-bubbling `change`; the
               capture listener is required for Svelte's delegated events. -->
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>
            Depth
            <vscode-single-select
              value={String(depth)}
              onchangecapture={(event: Event) => changeDepth(textValue(event))}
            >
              <vscode-option value="1">1 hop</vscode-option>
              <vscode-option value="2">2 hops</vscode-option>
              <vscode-option value="3">3 hops</vscode-option>
            </vscode-single-select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>
            Direction
            <vscode-single-select
              value={direction}
              onchangecapture={(event: Event) => changeDirection(textValue(event))}
            >
              <vscode-option value="both">both</vscode-option>
              <vscode-option value="callers">callers</vscode-option>
              <vscode-option value="callees">callees</vscode-option>
            </vscode-single-select>
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>
            Renderer
            <vscode-single-select
              value={renderer}
              onchangecapture={(event: Event) => changeRenderer(textValue(event))}
            >
              <vscode-option value="d3">D3</vscode-option>
              <vscode-option value="orchgraph">orchgraph</vscode-option>
            </vscode-single-select>
          </label>
          {#if renderer === "d3"}
                        <button
              class="vscode-button secondary"
              type="button"
              onclick={() => graphView?.fit()}
              disabled={!graphData}
            >Fit</button>
          {/if}
          {#if renderer === "orchgraph"}
                        <button
              class="vscode-button secondary"
              type="button"
              onclick={() => void copyTerminalArt()}
              disabled={!graphData}
              title="Copy the character-art graph"
            >Copy</button>
          {:else}
                        <button
              class="vscode-button secondary"
              type="button"
              onclick={() => graphView?.triggerExport?.()}
              disabled={!graphData}
            >Export SVG</button>
          {/if}
        </div>

        <div class="graph-summary">
          <span>
            {graphData
              ? `${graphData.nodes.length} nodes · ${graphData.edges.length} edges`
              : graphLoading
                ? "Loading graph…"
                : "No graph"}
          </span>
          {#if graphData?.truncated}
            <span class="badge">truncated</span>
          {/if}
          {#if searchHits.size > 0}
            <span class="sub">
              {searchHits.size} search {searchHits.size === 1 ? "hit" : "hits"} · Enter selects
              first
            </span>
          {/if}
          {#if exportStatus}
            <span class="sub">{exportStatus}</span>
          {/if}
        </div>

        {#if graphError}
          <p class="error compact">Neighborhood failed: {graphError}</p>
        {/if}

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
          <div class="graph-board graph-board-empty">
            <p class="graph-overlay">
              {graphLoading ? "Loading neighborhood…" : "No graph loaded."}
            </p>
          </div>
        {/if}
      </section>

      <section class="card detail" aria-label="Symbol details">
        {#if detailError}
          <p class="error compact">{detailError}</p>
        {/if}

        {#if symbol}
          <div class="detail-head">
            <div>
              <h2>{symbol.node.name}</h2>
              <div class="qn">{symbol.node.qualifiedName}</div>
              <div class="meta">
                {symbol.node.label} · {location(symbol.node.filePath, symbol.node.startLine)}
              </div>
            </div>
            <div class="detail-actions">
                            <button class="vscode-button" type="button" onclick={() => void jump()}>
                Jump
              </button>
            </div>
          </div>

          {#if symbol.node.docstring}
            <p>{symbol.node.docstring}</p>
          {/if}

          <div class="columns">
            <div>
              <h3>Callers ({symbol.callers.length})</h3>
              <ul>
                {#each symbol.callers as caller (caller.qualifiedName)}
                  <li>
                    <button class="link" type="button" onclick={() => openConnection(caller.qualifiedName)}>
                      {caller.name}
                    </button>
                    <div class="qn">{caller.qualifiedName}</div>
                    <div class="meta">{location(caller.filePath, caller.startLine)}</div>
                  </li>
                {/each}
                {#if symbol.callers.length === 0}
                  <li class="sub">none</li>
                {/if}
              </ul>
            </div>

            <div>
              <h3>Callees ({symbol.callees.length})</h3>
              <ul>
                {#each symbol.callees as callee (callee.qualifiedName)}
                  <li>
                    <button class="link" type="button" onclick={() => openConnection(callee.qualifiedName)}>
                      {callee.name}
                    </button>
                    <div class="qn">{callee.qualifiedName}</div>
                    <div class="meta">{location(callee.filePath, callee.startLine)}</div>
                  </li>
                {/each}
                {#if symbol.callees.length === 0}
                  <li class="sub">none</li>
                {/if}
              </ul>
            </div>
          </div>
        {:else if focusNode}
          <div class="detail-head">
            <div>
              <h2>{focusNode.name}</h2>
              <div class="qn">{focusNode.qualifiedName}</div>
              <div class="meta">
                {focusNode.label} · {location(focusNode.filePath, focusNode.startLine)}
              </div>
            </div>
            <div class="detail-actions">
                            <button class="vscode-button" type="button" onclick={() => void jump(focusNode)}>
                Jump
              </button>
            </div>
          </div>
          <p class="sub">Bundle details are unavailable for this graph node.</p>
        {:else}
          <p class="sub">Pick a symbol (or use Mock) to see its bundle and local call graph.</p>
        {/if}

        {#if jumpStatus}
          <p class="status">{jumpStatus}</p>
        {/if}
        {#if jumpError}
          <p class="error compact">{jumpError}</p>
        {/if}
      </section>
    </div>
  </div>
</main>
