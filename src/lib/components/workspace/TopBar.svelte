<script lang="ts">
  interface Props {
    project: string;
    sourceLabel: string;
    setupOpen: boolean;
    inspectorOpen: boolean;
    search: string;
    renderer: string;
    graphLoaded: boolean;
    onsearch: (value: string) => void;
    onsearchkeydown: (event: KeyboardEvent) => void;
    ontogglesetup: () => void;
    ontoggledetails: () => void;
    onfit: () => void;
    oncopysvg: () => void;
    onexportsvg: () => void;
    oncopyterminal: () => void;
  }

  let {
    project,
    sourceLabel,
    setupOpen,
    inspectorOpen,
    search,
    renderer,
    graphLoaded,
    onsearch,
    onsearchkeydown,
    ontogglesetup,
    ontoggledetails,
    onfit,
    oncopysvg,
    onexportsvg,
    oncopyterminal,
  }: Props = $props();
</script>

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
        onclick={ontogglesetup}
      >
        {project}<span class="context-kind">{sourceLabel}</span>
      </button>
    </div>
  </div>

  <label class="searchbox">
    <span class="sr-only">Search graph</span>
    <input
      type="search"
      class="search-input"
      value={search}
      oninput={(event: Event) => onsearch((event.currentTarget as HTMLInputElement).value)}
      onkeydown={onsearchkeydown}
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
</header>
