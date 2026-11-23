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
    oncommit?: (value: string) => void;
    /** Start indexing the existing absolute folder before `//`. */
    onindex?: (folder: string) => void;
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

  // Keep the editable draft in sync with programmatic graph changes, but
  // never overwrite what the user is currently typing.
  $effect(() => {
    if (!editing) draft = value;
  });

  const display = $derived(
    editing ? draft : new GlobalSymbolPath(value, cwd).toDisplay(),
  );
  const completionSource = $derived(
    symbolPathCompletionSource({ cwd, projects, fetchCbm }),
  );
  let indexPath = $state("");
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

  function commitValue(event: Event): void {
    const next = (event as CustomEvent<{ value: string }>).detail.value;
    if (next === lastCommit) return;
    lastCommit = next;
    oncommit?.(next);
  }

  function oninput(event: Event): void {
    draft = (event as CustomEvent<{ value: string }>).detail.value;
  }

  function onfocus(): void {
    editing = true;
    draft = value;
  }

  function onblur(): void {
    editing = false;
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
      {#if indexPath && onindex}
        <button
          class="index-new-button"
          type="button"
          aria-label="New index"
          title={`Index ${indexPath}`}
          onpointerdown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onclick={(event) => {
            event.stopPropagation();
            lastCommit = draft;
            onindex?.(indexPath);
          }}
        >+</button>
      {/if}
    {/snippet}
  </CodeInput>
</div>

<style>
  .root-field {
    display: grid;
    min-width: 0;
  }

  :global(.index-new-button) {
    flex: none;
    width: 2.6ch;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--vscode-input-border, var(--cg-line));
    background: transparent;
    color: var(--vscode-textLink-foreground, var(--cg-accent));
    font: inherit;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }

  :global(.index-new-button:hover),
  :global(.index-new-button:focus-visible) {
    background: var(--vscode-toolbar-hoverBackground, color-mix(in srgb, var(--cg-text) 10%, transparent));
    outline: none;
  }
</style>
