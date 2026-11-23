<script lang="ts">
  import CodeInput, {
    type CodeInputOption,
  } from "../CodeInput.svelte";
  import type { RootCandidate } from "../../graph/roots";
  import { GlobalSymbolPath, globalSymbolPathFor } from "../../symbol-path";

  interface Props {
    /** Canonical full global symbol path (absolute folder + //file#symbol). */
    value?: string;
    /** Workspace root used to collapse the folder while the field is idle. */
    cwd?: string;
    roots: RootCandidate[];
    loading?: boolean;
    label?: string;
    placeholder?: string;
    oncommit?: (value: string) => void;
  }

  let {
    value = $bindable(""),
    cwd = "",
    roots,
    loading = false,
    label = "Path bar",
    placeholder = "cwd//path/to/file#symbol",
    oncommit,
  }: Props = $props();

  let editing = $state(false);
  let draft = $state(value);

  // Keep the editable draft in sync with programmatic graph changes, but
  // never overwrite what the user is currently typing.
  $effect(() => {
    if (!editing) draft = value;
  });

  const display = $derived(
    editing ? draft : new GlobalSymbolPath(value, cwd).toDisplay(),
  );

  function commitValue(event: Event): void {
    oncommit?.((event as CustomEvent<{ value: string }>).detail.value);
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

  /** Completions are suggestions only; the field still accepts any path. */
  function rootOptions(): CodeInputOption[] {
    return roots.map((root) => {
      const path = globalSymbolPathFor(root, cwd);
      const value = path.hasFile ? path.toDisplay() : root.qualifiedName;
      return {
        value,
        label: value,
        description: describeRoot(root),
      };
    });
  }

  function describeRoot(root: RootCandidate): string {
    const location = root.filePath
      ? `${root.filePath}${root.startLine > 0 ? `:${root.startLine}` : ""}`
      : "";
    return [root.kind, root.reason, location].filter(Boolean).join(" · ");
  }
</script>

<div class="root-field">
  <CodeInput
    value={display}
    options={rootOptions}
    debounce={350}
    oninput={oninput}
    onfocus={onfocus}
    onblur={onblur}
    oncommit={commitValue}
    onchange={commitValue}
    aria-label={label}
    {placeholder}
    spellcheck={false}
  />
  {#if loading}<span class="root-status">loading roots…</span>{/if}
</div>

<style>
  .root-field {
    display: grid;
    min-width: 0;
    gap: 0.15lh;
  }

  .root-status {
    color: var(--vscode-descriptionForeground, var(--muted, #9d9d9d));
    font-size: 0.68rem;
  }
</style>
