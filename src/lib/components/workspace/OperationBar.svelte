<script lang="ts">
  import SymbolPathField from "./SymbolPathField.svelte";
  import type { CopyMode, SaveMode } from "../../ai-context";
  import type { CbmFetch, CbmProject } from "../../cbm-projects";

  interface Props {
    setupOpen: boolean;
    inspectorOpen: boolean;
    searchOpen: boolean;
    renderer: string;
    graphLoaded: boolean;
    /** Canonical full global symbol path. */
    entry?: string;
    cwd: string;
    projects: readonly CbmProject[];
    fetchCbm?: CbmFetch;
    copyMode?: CopyMode;
    copyFlash?: boolean;
    saveMode?: SaveMode;
    ontogglesearch: () => void;
    ontogglesetup: () => void;
    ontoggledetails: () => void;
    onfit: () => void;
    oncopy: () => void;
    onsave: () => void;
    onentrycommit: (value: string) => void | Promise<string | null>;
    onindex: (folder: string) => void | Promise<string | null>;
  }

  let {
    setupOpen,
    inspectorOpen,
    searchOpen,
    renderer,
    graphLoaded,
    entry = $bindable(""),
    cwd,
    projects,
    fetchCbm,
    copyMode = $bindable("svg"),
    copyFlash = false,
    saveMode = $bindable("svg"),
    ontogglesearch,
    ontogglesetup,
    ontoggledetails,
    onfit,
    oncopy,
    onsave,
    onentrycommit,
    onindex,
  }: Props = $props();
</script>

<div class="operationbar" aria-label="Graph toolbar">
  <div class="brand">
    <button
      class="brand-pill"
      class:active={setupOpen}
      type="button"
      aria-pressed={setupOpen}
      aria-keyshortcuts="S"
      aria-label="Code Graph setup"
      title="Source and project setup (S)"
      onclick={ontogglesetup}
    >Code Graph</button>
  </div>

  <div class="path-bar">
    <SymbolPathField
      bind:value={entry}
      {cwd}
      {projects}
      {fetchCbm}
      {onindex}
      label="Path bar"
      placeholder="cwd//path/to/file#symbol"
      oncommit={onentrycommit}
    />
  </div>

  <div class="bar-actions" aria-label="Graph actions">
    <button
      class="vscode-button secondary tool-button search-toggle"
      class:active={searchOpen}
      type="button"
      aria-pressed={searchOpen}
      aria-expanded={searchOpen}
      aria-label="Toggle search"
      aria-keyshortcuts="/"
      title="Toggle search (/)"
      onclick={ontogglesearch}
    >🔍</button>

    {#if renderer === "d3" && graphLoaded}
      <button
        class="vscode-button secondary tool-button icon-tool"
        type="button"
        onclick={onfit}
        title="Fit graph (F or .)"
        aria-label="Fit graph"
        aria-keyshortcuts="F"
      >⛶</button>
    {/if}

    <div class="split-action" class:copy-flash={copyFlash}>
      <button
        class="vscode-button secondary tool-button icon-tool"
        type="button"
        onclick={oncopy}
        disabled={!graphLoaded}
        title="Copy according to the selected format"
        aria-label="Copy"
      >📋</button>
      <select
        class="mode-select"
        aria-label="Copy mode"
        bind:value={copyMode}
      >
        <option value="svg">SVG</option>
        <option value="absolute">Abs. path</option>
        <option value="relative">Rel. path</option>
        <option value="markdown">md for AI</option>
        <option value="json">json for AI</option>
      </select>
    </div>

    <div class="split-action">
      <button
        class="vscode-button secondary tool-button icon-tool"
        type="button"
        onclick={onsave}
        disabled={!graphLoaded || renderer !== "d3"}
        title={renderer === "d3" ? "Save the graph" : "SVG saving needs the D3 renderer"}
        aria-label="Save"
      >💾</button>
      <select
        class="mode-select"
        aria-label="Save format"
        bind:value={saveMode}
      >
        <option value="svg">SVG</option>
      </select>
    </div>

    <button
      class="vscode-button secondary tool-button markdown-toggle"
      class:active={inspectorOpen}
      type="button"
      aria-pressed={inspectorOpen}
      aria-keyshortcuts="D"
      aria-label="forAI panel"
      title="Toggle forAI panel (D)"
      onclick={ontoggledetails}
    >{"{MD}"}</button>
  </div>
</div>
