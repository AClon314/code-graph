<script lang="ts">
  import CodeInput, {
    type CodeInputOption,
  } from "../CodeInput.svelte";
  import type { RootCandidate } from "../../graph/roots";

  interface Props {
    value?: string;
    roots: RootCandidate[];
    loading?: boolean;
    label?: string;
  }

  let {
    value = $bindable(""),
    roots,
    loading = false,
    label = "Symbol entry (qualified name or #id)",
  }: Props = $props();

  /** Completions are suggestions only; the field still accepts any QN. */
  function rootOptions(): CodeInputOption[] {
    return roots.map((root) => ({
      value: root.qualifiedName,
      label: root.qualifiedName,
      description: describeRoot(root),
    }));
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
    bind:value
    options={rootOptions}
    aria-label={label}
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
