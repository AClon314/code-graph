<script lang="ts">
  import CodeInput from "../CodeInput.svelte";
  import { browseCbmPath, symbolPathCompletionSource } from "../symbol-path-complete";
  import type { CbmFetch, CbmProject } from "../../cbm-projects";
  import { GlobalSymbolPath, toUnixPath } from "../../symbol-path";

  interface Props {
    /** Canonical current global symbol path. */
    value?: string;
    /** Workspace root used to collapse the folder while the field is idle. */
    cwd?: string;
    /** Indexed project names/roots used by the prefix completion. */
    projects?: readonly CbmProject[];
    /** cbm transport used for filesystem completion. */
    fetchCbm?: CbmFetch;
    label?: string;
    placeholder?: string;
    /** Return an error string when the path cannot be applied. */
    oncommit?: (value: string) => void | Promise<string | null>;
    /** Start indexing the existing absolute folder before `//`. */
    onindex?: (folder: string) => void | Promise<string | null>;
  }

  let {
    value = $bindable(""),
    cwd = "",
    projects = [],
    fetchCbm,
    label = "Path bar",
    placeholder = "project//path/to/file#symbol",
    oncommit,
    onindex,
  }: Props = $props();

  let editing = $state(false);
  let draft = $state(value);
  let lastCommit = "";
  /** The rejected text stays visible until a later commit succeeds. */
  let invalid = $state("");
  let history = $state<string[]>([]);
  let historyIndex = $state(-1);
  let actionsOpen = $state(false);
  let indexing = $state(false);
  let indexPath = $state("");
  let commitSequence = 0;

  // Keep the editable draft in sync with programmatic graph changes, but never
  // replace rejected text (that would be the blur-to-old-value bug).
  $effect(() => {
    if (!editing && !invalid) draft = value;
  });

  // Seed undo with the last valid path. Later commits append to this history.
  $effect(() => {
    if (history.length > 0 || editing || invalid) return;
    const initial = new GlobalSymbolPath(value, cwd).toDisplay();
    if (initial) {
      history = [initial];
      historyIndex = 0;
    }
  });

  const display = $derived(editing ? draft : invalid || new GlobalSymbolPath(value, cwd).toDisplay());
  const completionSource = $derived(symbolPathCompletionSource({ cwd, projects, fetchCbm }));
  const expanded = $derived(
    Boolean(invalid) || actionsOpen || indexing || (editing && Boolean(indexPath)),
  );
  const showActions = $derived(Boolean(onindex) || history.length > 0);
  const canUndo = $derived(history.length > 0 && (Boolean(invalid) || historyIndex > 0));
  const canRedo = $derived(historyIndex >= 0 && historyIndex < history.length - 1);
  const indexReady = $derived(Boolean(indexPath) && !indexing);
  const previousPath = () => new GlobalSymbolPath(value, cwd).toDisplay();

  $effect(() => {
    const text = toUnixPath(editing ? draft : display);
    const separator = text.indexOf("//");
    const prefix = separator >= 0 ? text.slice(0, separator) : "";
    if (!fetchCbm || !prefix.startsWith("/")) {
      indexPath = "";
      return;
    }
    const timer = setTimeout(() => {
      const request = browseCbmPath(fetchCbm, prefix);
      if (request) request.then(() => (indexPath = prefix)).catch(() => (indexPath = ""));
    }, 250);
    return () => clearTimeout(timer);
  });

  function remember(previous: string, next: string): void {
    if (history.length === 0 && previous) {
      history = [previous];
      historyIndex = 0;
    }
    if (history[historyIndex] === next) return;
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(next);
    history = nextHistory;
    historyIndex = nextHistory.length - 1;
  }

  async function submit(next: string, rememberIt = true): Promise<string | null> {
    const sequence = ++commitSequence;
    const previous = previousPath();
    let error: string | null = null;
    try {
      error = (await oncommit?.(next)) ?? null;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    if (sequence !== commitSequence) return error;
    if (error) {
      invalid = next;
      return error;
    }
    invalid = "";
    if (rememberIt) remember(previous, next);
    return null;
  }

  function commitValue(event: Event): void {
    const next = (event as CustomEvent<{ value: string }>).detail.value;
    if (next === lastCommit) return;
    lastCommit = next;
    void submit(next);
  }

  function oninput(event: Event): void {
    draft = (event as CustomEvent<{ value: string }>).detail.value;
  }

  function onfocus(): void {
    editing = true;
    draft = invalid || value;
    actionsOpen = false;
  }

  function onblur(): void {
    editing = false;
    actionsOpen = false;
    // Deliberately keep `invalid`; the rejected text must survive blur.
  }

  function applyHistory(text: string): void {
    invalid = "";
    draft = text;
    lastCommit = text;
    actionsOpen = false;
    void submit(text, false);
  }

  function undo(): void {
    if (indexing) return;
    const nextIndex = invalid ? historyIndex : historyIndex - 1;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    applyHistory(history[nextIndex] ?? "");
  }

  function redo(): void {
    if (indexing || historyIndex + 1 >= history.length) return;
    historyIndex += 1;
    applyHistory(history[historyIndex] ?? "");
  }

  async function indexNow(): Promise<void> {
    if (!indexPath || indexing) return;
    const folder = indexPath;
    const text = `${folder}//`;
    const previous = previousPath();
    indexing = true;
    actionsOpen = false;
    invalid = "";
    draft = text;
    lastCommit = text;
    try {
      const error = (await onindex?.(folder)) ?? null;
      if (error) {
        invalid = text;
      } else {
        invalid = "";
        remember(previous, text);
      }
    } catch (cause) {
      invalid = text;
      console.warn(`[code-graph] index ${folder} failed`, cause);
    } finally {
      indexing = false;
    }
  }

  function preventBlur(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div class="root-field">
  <CodeInput
    value={display}
    options={[]}
    showClear={false}
    completionSources={[completionSource]}
    activateOnTyping={true}
    debounce={350}
    oninput={oninput}
    onfocus={onfocus}
    onblur={onblur}
    oncommit={commitValue}
    onchange={commitValue}
    aria-label={label}
    {placeholder}
    spellcheck={false}
  >
    {#snippet afterInput()}
      {#if showActions}
        <div class="path-actions" class:expanded>
          {#if expanded}
            {#if onindex}
              <button
                class="path-action"
                type="button"
                aria-label="New index"
                title={indexing ? `Indexing ${indexPath}…` : `Index ${indexPath || "folder"}`}
                disabled={!indexReady}
                onpointerdown={preventBlur}
                onclick={(event) => {
                  event.stopPropagation();
                  void indexNow();
                }}
              >{indexing ? "…" : "+"}</button>
            {/if}
            <button
              class="path-action"
              type="button"
              aria-label="Undo path"
              title="Undo to the previous path"
              disabled={!canUndo || indexing}
              onpointerdown={preventBlur}
              onclick={(event) => {
                event.stopPropagation();
                undo();
              }}
            >↶</button>
            <button
              class="path-action"
              type="button"
              aria-label="Redo path"
              title="Redo the next path"
              disabled={!canRedo || indexing}
              onpointerdown={preventBlur}
              onclick={(event) => {
                event.stopPropagation();
                redo();
              }}
            >↷</button>
          {:else}
            <button
              class="path-action actions-toggle"
              type="button"
              aria-label="Path actions"
              aria-expanded={actionsOpen}
              title="Index, undo, or redo"
              onpointerdown={preventBlur}
              onclick={(event) => {
                event.stopPropagation();
                actionsOpen = true;
              }}
            >…</button>
          {/if}
        </div>
      {/if}
    {/snippet}
  </CodeInput>
</div>

<style>
  .root-field {
    display: grid;
    min-width: 0;
  }

  :global(.path-actions) {
    display: flex;
    flex: none;
    align-items: stretch;
    border-left: 1px solid var(--vscode-input-border, var(--cg-line));
  }

  :global(.path-action) {
    min-width: var(--cg-touch-target, 3lh);
    min-height: var(--cg-touch-target, 3lh);
    padding: 0 0.35ch;
    border: 0;
    border-left: 1px solid var(--vscode-input-border, var(--cg-line));
    background: transparent;
    color: var(--vscode-textLink-foreground, var(--cg-accent));
    font: inherit;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  :global(.path-actions > .path-action:first-child) {
    border-left: 0;
  }

  :global(.path-action:hover:not(:disabled)),
  :global(.path-action:focus-visible) {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--cg-text) 10%, transparent));
    outline: none;
  }

  :global(.path-action:disabled) {
    color: var(--vscode-disabledForeground, var(--cg-muted));
    cursor: default;
    opacity: 0.5;
  }

  :global(.path-actions.expanded) {
    background: color-mix(in srgb, var(--cg-text) 4%, transparent);
  }
</style>
