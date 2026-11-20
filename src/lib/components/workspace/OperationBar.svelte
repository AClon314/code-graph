<script lang="ts">
  import RootEntryField from "./RootEntryField.svelte";
  import type { RootCandidate } from "../../graph/roots";

  interface Props {
    project: string;
    setupOpen: boolean;
    inspectorOpen: boolean;
    searchOpen: boolean;
    renderer: string;
    graphLoaded: boolean;
    entry?: string;
    roots: RootCandidate[];
    rootsLoading: boolean;
    ontogglesearch: () => void;
    ontogglesetup: () => void;
    ontoggledetails: () => void;
    onfit: () => void;
    oncopysvg: () => void;
    onexportsvg: () => void;
    oncopyterminal: () => void;
    onentrycommit: (value: string) => void;
  }

  let {
    project,
    setupOpen,
    inspectorOpen,
    searchOpen,
    renderer,
    graphLoaded,
    entry = $bindable(""),
    roots,
    rootsLoading,
    ontogglesearch,
    ontogglesetup,
    ontoggledetails,
    onfit,
    oncopysvg,
    onexportsvg,
    oncopyterminal,
    onentrycommit,
  }: Props = $props();
</script>

<div class="operationbar" aria-label="Graph toolbar">
  <div class="brand">
    <h1 class="brand-pill">Code Graph</h1>
    <button
      class="context-chip"
      type="button"
      aria-expanded={setupOpen}
      title="Project and source setup"
      onclick={ontogglesetup}
    >{project}</button>
  </div>

  <div class="path-bar">
    <span class="path-label" aria-hidden="true">path</span>
    <RootEntryField
      bind:value={entry}
      {roots}
      loading={rootsLoading}
      label="Path bar"
      placeholder="All entries — type a symbol path"
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
    {#if renderer === "d3"}
      {#if graphLoaded}
        <button
          class="vscode-button secondary tool-button"
          type="button"
          onclick={onfit}
          title="Fit graph (F or .)"
          aria-keyshortcuts="F"
        >Fit</button>
      {/if}
      <button
        class="vscode-button secondary tool-button"
        type="button"
        onclick={oncopysvg}
        disabled={!graphLoaded}
        title="Copy SVG to clipboard"
      >Copy SVG</button>
      <button
        class="vscode-button secondary tool-button"
        type="button"
        onclick={onexportsvg}
        disabled={!graphLoaded}
        title="Download SVG"
      >Export SVG</button>
    {:else}
      <button
        class="vscode-button secondary tool-button"
        type="button"
        onclick={oncopyterminal}
        disabled={!graphLoaded}
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
      onclick={ontoggledetails}
    >Details</button>
    <button
      class="vscode-button secondary tool-button"
      class:active={setupOpen}
      type="button"
      aria-pressed={setupOpen}
      aria-keyshortcuts="S"
      title="Toggle source and project setup (S)"
      onclick={ontogglesetup}
    >Setup</button>
  </div>
</div>
