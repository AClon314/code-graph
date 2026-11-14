<script lang="ts">
  import type { RootCandidate } from "../../graph/roots";

  interface Props {
    value?: string;
    roots: RootCandidate[];
    loading?: boolean;
    label?: string;
    placeholder?: string;
  }

  let {
    value = $bindable(""),
    roots,
    loading = false,
    label = "Symbol entry (qualified name or #id)",
    placeholder = "Qualified name or #id",
  }: Props = $props();

  function textValue(event: Event): string {
    return (event.currentTarget as HTMLElement & { value: string }).value;
  }

  function selectRoot(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    const next = select.value;
    if (next) value = next;
    // Keep the collapsed control as an arrow-only dropdown.
    select.value = "";
  }
</script>

<!-- vscode-textfield has no datalist support. A native select next to the
     free-form input keeps the arrow-only affordance; its popup still shows
     the full paths/QNs. -->
<div class="root-field">
  <div class="root-entry">
    <vscode-textfield
      value={value}
      aria-label={label}
      placeholder={placeholder}
      spellcheck="false"
      oninput={(event: Event) => (value = textValue(event))}
    ></vscode-textfield>
    <select
      class="root-select"
      aria-label="Open a path or project root"
      title="Open a path or project root"
      onchange={(event: Event) => selectRoot(event)}
    >
      <option value=""></option>
      {#each roots as candidate (candidate.value ?? candidate.qualifiedName)}
        <option value={candidate.value ?? candidate.qualifiedName}>
          {candidate.display ?? candidate.qualifiedName}
        </option>
      {/each}
    </select>
  </div>
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

  .root-entry {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .root-entry vscode-textfield {
    flex: 1;
    min-width: 0;
  }

  /* An arrow-only native select beside the free-form input. Native pickers
     render option text in the popup even when the collapsed face is hidden. */
  .root-select {
    width: 3ch;
    padding: 0;
    border: 1px solid var(--vscode-input-border, var(--line));
    border-left: 0;
    border-radius: 0 0.25rem 0.25rem 0;
    background-color: var(--vscode-input-background, var(--panel));
    background-image:
      linear-gradient(45deg, transparent 50%, var(--vscode-foreground, var(--text)) 50%),
      linear-gradient(135deg, var(--vscode-foreground, var(--text)) 50%, transparent 50%);
    background-position:
      calc(100% - 1.35ch) 50%,
      calc(100% - 1ch) 50%;
    background-repeat: no-repeat;
    background-size: 0.4ch 0.4ch, 0.4ch 0.4ch;
    appearance: none;
    color: transparent;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .root-select option {
    color: var(--vscode-foreground, var(--text));
    background: var(--vscode-input-background, var(--panel));
  }
</style>
