<script lang="ts">
  import { onMount } from "svelte";

  import GraphView from "./lib/components/GraphView.svelte";
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
    TreeEntry,
  } from "./lib/graph/types";
  import { JumpClient, jumpTargetFrom } from "./lib/jump/client";
  import { reactWorkspaceUrl } from "./lib/navigation";

  type SourceKind = "mock" | "cbm";
  type Depth = 1 | 2 | 3;
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
  let entries = $state<TreeEntry[]>([]);
  let symbol = $state<SymbolBundle | null>(null);
  let selectedPath = $state("");
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
  let graphView = $state<GraphView>();

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
    return kind === "mock" ? mock : new CbmHttpSource({ project });
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
    const [treeResult, symbolResult] = await Promise.allSettled([
      source.tree(project),
      source.symbol(project, ref),
    ]);
    if (id !== requestId) return;

    const problems: string[] = [];
    if (treeResult.status === "fulfilled") {
      entries = treeResult.value;
    } else {
      entries = [];
      problems.push(`tree: ${message(treeResult.reason)}`);
    }

    if (symbolResult.status === "fulfilled") {
      symbol = symbolResult.value;
      selectedId = symbol.node.qualifiedName;
      focusNode = null;
      selectedPath = symbol.node.filePath ?? selectedPath;
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
    void load();
  });

  function setKind(next: SourceKind): void {
    kind = next;
    selectedPath = "";
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
    void load();
  }

  function changeDepth(value: string): void {
    const next = Number(value);
    if (next !== 1 && next !== 2 && next !== 3) return;
    depth = next;
    void reloadGraph();
  }

  function changeDirection(value: string): void {
    if (value !== "both" && value !== "callers" && value !== "callees") return;
    direction = value;
    void reloadGraph();
  }

  async function selectGraphNode(node: GraphViewNode): Promise<void> {
    selectedId = node.id;
    focusNode = node;
    selectedPath = node.filePath ?? selectedPath;
    ref = node.qualifiedName || node.id;
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
    const target = row ? jumpTargetFrom(project, row) : null;
    if (!target) {
      jumpError = "This symbol has no file path to jump to.";
      return;
    }

    jumpStatus = "Sending jump…";
    try {
      const receipt = await new JumpClient().send(target);
      jumpStatus = `Jump sent${receipt.client ? ` to ${receipt.client}` : ""} · ${target.path}:${target.line}`;
    } catch (cause) {
      jumpStatus = "";
      jumpError = `Jump failed: ${message(cause)}`;
    }
  }

  function jumpFromNode(node: GraphViewNode): void {
    selectedId = node.id;
    focusNode = node;
    void jump(node);
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
.orchgraph-node-kind { fill: var(--muted, #666666); font: 600 9px ui-sans-serif, system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.orchgraph-node-label { fill: var(--text, #111111); font: 600 14px ui-sans-serif, system-ui, sans-serif; }
.orchgraph-node-detail { fill: var(--muted, #666666); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.orchgraph-node.is-search-hit rect { stroke: var(--hit, #c98a00); stroke-width: 2; }
.orchgraph-node.is-selected rect { stroke: var(--accent, #176b5a); stroke-width: 2.5; }
`.trim();
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
        <button class:active={kind === "mock"} type="button" onclick={() => setKind("mock")}>
          Mock
        </button>
        <button class:active={kind === "cbm"} type="button" onclick={() => setKind("cbm")}>
          cbm HTTP
        </button>
      </div>
      <a
        class="external"
        href={reactWorkspaceUrl("galaxy")}
        title="Open CBM Lens (React)"
      >CBM-LENS(react)↗</a>
    </div>
  </header>

  <section class="controls" aria-label="Query">
    <label>
      Project
      <input bind:value={project} spellcheck="false" />
    </label>
    <label>
      Symbol (qn or #id)
      <input bind:value={ref} spellcheck="false" />
    </label>
    <button type="button" onclick={() => void load()} disabled={loading}>
      {loading ? "Loading…" : "Load"}
    </button>
  </section>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="board">
    <aside class="card tree-card">
      <h2>Tree</h2>
      <div class="sub">{selectedPath || project}</div>
      <div class="tree">
        {#each entries as entry (`${entry.kind}:${entry.path}`)}
          <button
            class="tree-row"
            class:selected={selectedPath === entry.path}
            type="button"
            onclick={() => (selectedPath = entry.path)}
          >
            <span>{entry.kind === "dir" ? "▸" : "·"}</span>
            <span>{entry.name}</span>
            {#if entry.symbols !== undefined}
              <small>{entry.symbols}</small>
            {/if}
          </button>
        {/each}
        {#if entries.length === 0 && !loading}
          <p class="sub">No entries. Check the project name or switch to Mock.</p>
        {/if}
      </div>
    </aside>

    <div class="graph-column">
      <section class="card graph-card" aria-label="Call graph">
        <div class="graph-toolbar">
          <label class="search-field">
            Search graph
            <input
              bind:value={search}
              onkeydown={onSearchKeydown}
              placeholder="name or qualified name"
              spellcheck="false"
              autocomplete="off"
            />
          </label>
          <label>
            Depth
            <select value={String(depth)} onchange={(event) => changeDepth(event.currentTarget.value)}>
              <option value="1">1 hop</option>
              <option value="2">2 hops</option>
              <option value="3">3 hops</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={direction}
              onchange={(event) => changeDirection(event.currentTarget.value)}
            >
              <option value="both">both</option>
              <option value="callers">callers</option>
              <option value="callees">callees</option>
            </select>
          </label>
          <button class="tool" type="button" onclick={() => graphView?.fit()} disabled={!graphData}>
            Fit
          </button>
          <button
            class="tool"
            type="button"
            onclick={() => graphView?.triggerExport()}
            disabled={!graphData}
          >
            Export SVG
          </button>
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
          <GraphView
            bind:this={graphView}
            data={graphData}
            {selectedId}
            {searchHits}
            onselect={(node) => void selectGraphNode(node)}
            onexport={exportSvg}
            onjump={jumpFromNode}
          />
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
              <button class="jump" type="button" onclick={() => void jump()}>
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
                    <button class="tree-row" type="button" onclick={() => openConnection(caller.qualifiedName)}>
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
                    <button class="tree-row" type="button" onclick={() => openConnection(callee.qualifiedName)}>
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
              <button class="jump" type="button" onclick={() => void jump(focusNode)}>
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
