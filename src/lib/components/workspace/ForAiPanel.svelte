<script lang="ts">
  import type { AiContext, DetailMode } from "../../ai-context";
  import { renderMarkdown } from "../../markdown";

  interface Props {
    context: AiContext | null;
    mode: DetailMode;
    loading: boolean;
    error: string;
    onmode: (mode: DetailMode) => void;
    onclose: () => void;
    onopen: (symbolPath: string) => void;
  }

  let {
    context,
    mode,
    loading,
    error,
    onmode,
    onclose,
    onopen,
  }: Props = $props();

  const modes: readonly { value: DetailMode; label: string }[] = [
    { value: "raw", label: "Raw" },
    { value: "preview", label: "Preview" },
    { value: "json", label: "JSON" },
  ];

  function previewLinks(node: HTMLElement): { destroy: () => void } {
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || /^(https?:|mailto:)/i.test(href)) return;
      event.preventDefault();
      onopen(href);
    };
    node.addEventListener("click", handler);
    return { destroy: () => node.removeEventListener("click", handler) };
  }
</script>

<aside class="edge-panel inspector-panel" aria-label="forAI">
  <div class="inspector-body ai-body">
    {#if error}
      <p class="error compact">{error}</p>
    {/if}

    <div class="ai-modes" role="group" aria-label="forAI format">
      {#each modes as item (item.value)}
        <button
          class="ai-tab"
          class:active={mode === item.value}
          type="button"
          aria-pressed={mode === item.value}
          onclick={() => onmode(item.value)}
        >{item.label}</button>
      {/each}
    </div>

    {#if context}
      {#if mode === "preview"}
        <div class="ai-preview" use:previewLinks>
          {@html renderMarkdown(context.markdown)}
        </div>
      {:else if mode === "json"}
        <pre class="ai-raw">{JSON.stringify(context.json, null, 2)}</pre>
      {:else}
        <pre class="ai-raw">{context.markdown}</pre>
      {/if}
    {:else if loading}
      <p class="inspector-empty" role="status">Loading symbol context…</p>
    {:else}
      <p class="inspector-empty">
        Select a node in the graph to build its global symbol path and call context.
      </p>
    {/if}
  </div>

  <div class="panel-head">
    <div>
      <h2 class="panel-title">forAI</h2>
      <span class="sub">{context?.path.toDisplay() ?? "No selection"}</span>
    </div>
    <button class="icon-button" type="button" aria-label="Close forAI" onclick={onclose}>×</button>
  </div>
</aside>

<style>
  .ai-body {
    gap: 0.6lh;
  }

  .ai-modes {
    display: inline-flex;
    overflow: hidden;
    width: fit-content;
    border: 1px solid var(--vscode-input-border, var(--line));
    border-radius: 0.35rem;
  }

  .ai-tab {
    min-width: 7ch;
    padding: 0.22lh 0.65ch;
    border: 0;
    border-right: 1px solid var(--vscode-input-border, var(--line));
    background: transparent;
    color: var(--text);
    font-size: 0.72rem;
    cursor: pointer;
  }

  .ai-tab:last-child {
    border-right: 0;
  }

  .ai-tab:hover,
  .ai-tab:focus-visible {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--text) 10%, transparent));
    outline: none;
  }

  .ai-tab.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }

  .ai-raw {
    flex: 1;
    min-height: 12lh;
    margin: 0;
    padding: 0.6lh 0.8ch;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 0.35rem;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-code);
    font-size: 0.74rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .ai-preview {
    flex: 1;
    min-height: 12lh;
    padding: 0.2lh 0.2ch 1lh;
    overflow: auto;
    color: var(--text);
    font-size: 0.8rem;
    line-height: 1.55;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .ai-preview :global(h1),
  .ai-preview :global(h2),
  .ai-preview :global(h3),
  .ai-preview :global(h4) {
    margin: 0.7lh 0 0.25lh;
    font-family: var(--font-code);
    line-height: 1.3;
  }

  .ai-preview :global(h1) {
    font-size: 1rem;
  }

  .ai-preview :global(h2) {
    font-size: 0.9rem;
  }

  .ai-preview :global(h3) {
    font-size: 0.84rem;
  }

  .ai-preview :global(h4) {
    margin-top: 1lh;
    color: var(--muted);
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .ai-preview :global(p) {
    margin: 0.3lh 0;
  }

  .ai-preview :global(ul) {
    margin: 0.3lh 0;
    padding-left: 2ch;
  }

  .ai-preview :global(li) {
    margin: 0.12lh 0;
  }

  .ai-preview :global(a) {
    color: var(--vscode-textLink-foreground, var(--accent));
    text-decoration: none;
  }

  .ai-preview :global(a:hover) {
    text-decoration: underline;
  }

  .ai-preview :global(code) {
    padding: 0.05lh 0.35ch;
    border-radius: 0.2rem;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    font-family: var(--font-code);
    font-size: 0.92em;
  }

  .ai-preview :global(pre) {
    overflow: auto;
    padding: 0.5lh 0.7ch;
    border: 1px solid var(--line);
    border-radius: 0.3rem;
    background: var(--bg);
    font-family: var(--font-code);
    font-size: 0.74rem;
  }

  .ai-preview :global(pre code) {
    padding: 0;
    background: transparent;
  }

  .ai-preview :global(blockquote) {
    margin: 0.4lh 0;
    padding-left: 1ch;
    border-left: 2px solid var(--line);
    color: var(--muted);
  }
</style>
