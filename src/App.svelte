<script lang="ts">
  import { onMount } from "svelte";

  import { CbmHttpSource } from "./lib/graph/cbm-http";
  import { MockSource } from "./lib/graph/mock";
  import type { GraphSource, SymbolBundle, TreeEntry } from "./lib/graph/types";

  type SourceKind = "mock" | "cbm";

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

  function currentSource(): GraphSource {
    return kind === "mock" ? mock : new CbmHttpSource({ project });
  }

  async function load(): Promise<void> {
    const id = ++requestId;
    loading = true;
    error = "";
    try {
      const source = currentSource();
      const [nextEntries, nextSymbol] = await Promise.all([
        source.tree(project),
        source.symbol(project, ref),
      ]);
      if (id !== requestId) return;
      entries = nextEntries;
      symbol = nextSymbol;
    } catch (cause) {
      if (id !== requestId) return;
      entries = [];
      symbol = null;
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (id === requestId) loading = false;
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

  function location(filePath?: string, line?: number): string {
    if (!filePath) return "unknown location";
    return line ? `${filePath}:${line}` : filePath;
  }
</script>

<main class="app">
  <header>
    <div>
      <h1>code-graph</h1>
      <div class="sub">SCIP → cbm → Svelte shell (B0)</div>
    </div>
    <div class="switcher" aria-label="Graph source">
      <button class:active={kind === "mock"} type="button" onclick={() => setKind("mock")}>
        Mock
      </button>
      <button class:active={kind === "cbm"} type="button" onclick={() => setKind("cbm")}>
        cbm HTTP
      </button>
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
    <aside class="card">
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

    <section class="card detail">
      {#if symbol}
        <div>
          <h2>{symbol.node.name}</h2>
          <div class="qn">{symbol.node.qualifiedName}</div>
          <div class="meta">
            {symbol.node.label} · {location(symbol.node.filePath, symbol.node.startLine)}
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
      {:else}
        <p class="sub">Pick a symbol (or use Mock) to see its bundle.</p>
      {/if}
    </section>
  </div>

  <footer>B0 shell · B1 CodeMirror reader · B2 2D graph/trace/impact</footer>
</main>
