<script lang="ts">
  interface Props {
    value: string;
    current: number;
    total: number;
    oninput: (value: string) => void;
    onkeydown: (event: KeyboardEvent) => void;
    onprevious: () => void;
    onnext: () => void;
  }

  let {
    value,
    current,
    total,
    oninput,
    onkeydown,
    onprevious,
    onnext,
  }: Props = $props();
</script>

<div class="search-row" role="search" aria-label="Graph search">
  <label class="searchbox">
    <span class="sr-only">Search graph</span>
    <input
      type="search"
      class="search-input"
      {value}
      oninput={(event: Event) => oninput((event.currentTarget as HTMLInputElement).value)}
      {onkeydown}
      aria-label="Search graph"
      aria-keyshortcuts="/"
      tabindex="0"
      placeholder="Search graph"
      title="Search graph; Enter next match, Shift+Enter previous"
      spellcheck="false"
      autocomplete="off"
    />
  </label>
  <span class="search-counter" aria-live="polite" title="Current match / total matches">
    {current}/{total}
  </span>
  <button
    class="vscode-button secondary search-step"
    type="button"
    aria-label="Previous match"
    title="Previous match (Shift+Enter)"
    disabled={total === 0}
    onclick={onprevious}
  >‹</button>
  <button
    class="vscode-button secondary search-step"
    type="button"
    aria-label="Next match"
    title="Next match (Enter)"
    disabled={total === 0}
    onclick={onnext}
  >›</button>
</div>
