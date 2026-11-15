<script module lang="ts">
  export type CodeInputOption =
    | string
    | {
        value: string;
        label?: string;
        description?: string;
      };

  let nextListId = 0;
</script>

<script lang="ts">
  import { Compartment, EditorState, type Transaction } from "@codemirror/state";
  import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
  import { onMount } from "svelte";

  interface Props {
    value?: string;
    options?: readonly CodeInputOption[];
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    form?: string;
    autofocus?: boolean;
    maxlength?: number;
    minlength?: number;
    pattern?: string;
    autocomplete?: string;
    inputmode?: string;
    spellcheck?: boolean | "true" | "false";
    class?: string;
    style?: string;
    oninput?: (event: Event) => void;
    onchange?: (event: Event) => void;
    onfocus?: (event: FocusEvent) => void;
    onblur?: (event: FocusEvent) => void;
    [key: string]: unknown;
  }

  type NormalizedOption = {
    value: string;
    label: string;
    description?: string;
  };

  let {
    value = $bindable(""),
    options = [],
    placeholder = "",
    disabled = false,
    readonly = false,
    required = false,
    name = "",
    id = "",
    form = "",
    autofocus = false,
    maxlength,
    minlength,
    pattern,
    autocomplete = "off",
    inputmode,
    spellcheck = false,
    class: className = "",
    style = "",
    oninput,
    onchange,
    onfocus,
    onblur,
    ...rest
  }: Props = $props();

  const listId = `code-input-list-${++nextListId}`;

  let wrapper: HTMLDivElement | undefined;
  let editorHost: HTMLDivElement | undefined;
  let menu = $state<HTMLDivElement>();
  let view: EditorView | undefined;
  let open = $state(false);
  let highlighted = $state(0);
  let filter = $state("");
  let syncing = false;
  let lastCommitted = value;

  const normalizedOptions = $derived.by<NormalizedOption[]>(() =>
    options.map((option) =>
      typeof option === "string"
        ? { value: option, label: option }
        : {
            value: option.value,
            label: option.label ?? option.value,
            description: option.description,
          },
    ),
  );

  const visibleOptions = $derived(filterOptions(filter));
  const selectedOption = $derived(visibleOptions[highlighted]);

  const editorOnlyAttributes = new Set([
    "aria-activedescendant",
    "aria-autocomplete",
    "aria-controls",
    "aria-describedby",
    "aria-disabled",
    "aria-errormessage",
    "aria-expanded",
    "aria-haspopup",
    "aria-invalid",
    "aria-label",
    "aria-labelledby",
    "aria-required",
    "aria-roledescription",
    "autocapitalize",
    "autocomplete",
    "dir",
    "enterkeyhint",
    "inputmode",
    "lang",
    "role",
    "spellcheck",
    "tabindex",
    "title",
  ]);

  const editorRest = $derived.by(() => {
    const attrs: Record<string, string> = {};
    for (const [key, raw] of Object.entries(rest)) {
      if (!editorOnlyAttributes.has(key) && !key.startsWith("aria-")) continue;
      if (raw === undefined || raw === null || raw === false) continue;
      attrs[key] = raw === true ? "true" : String(raw);
    }
    if (inputmode) attrs.inputmode = inputmode;
    attrs.autocomplete = autocomplete;
    attrs.spellcheck = String(spellcheck);
    return attrs;
  });

  const wrapperRest = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(
        ([key]) => !editorOnlyAttributes.has(key) && !key.startsWith("aria-"),
      ),
    ),
  );

  const attrsCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const placeholderCompartment = new Compartment();

  function filterOptions(query: string): NormalizedOption[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return normalizedOptions;
    const starts: NormalizedOption[] = [];
    const contains: NormalizedOption[] = [];
    for (const option of normalizedOptions) {
      const haystack = `${option.value}\n${option.label}`.toLocaleLowerCase();
      if (haystack.startsWith(needle)) starts.push(option);
      else if (haystack.includes(needle)) contains.push(option);
    }
    return [...starts, ...contains];
  }

  function contentAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {
      ...editorRest,
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": String(open),
      "aria-haspopup": "listbox",
    };
    if (id) attrs.id = id;
    if (open) {
      attrs["aria-controls"] = listId;
      if (selectedOption) {
        attrs["aria-activedescendant"] = `${listId}-${highlighted}`;
      }
    }
    if (required) attrs["aria-required"] = "true";
    if (readonly) attrs["aria-readonly"] = "true";
    if (disabled) attrs["aria-disabled"] = "true";
    return attrs;
  }

  function editableExtensions() {
    const locked = readonly || disabled;
    return [EditorState.readOnly.of(locked), EditorView.editable.of(!disabled)];
  }

  function singleLineAndLimit(transaction: Transaction) {
    if (!transaction.docChanged) return transaction;
    let text = transaction.newDoc.toString();
    let changed = false;
    if (/[\r\n]/.test(text)) {
      text = text.replace(/[\r\n]+/g, " ");
      changed = true;
    }
    if (maxlength !== undefined && text.length > maxlength) {
      text = text.slice(0, maxlength);
      changed = true;
    }
    if (!changed) return transaction;
    return transaction.startState.update({
      changes: {
        from: 0,
        to: transaction.startState.doc.length,
        insert: text,
      },
      selection: { anchor: text.length },
    });
  }

  const theme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "inherit",
      fontFamily: "inherit",
      fontSize: "inherit",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "hidden",
      fontFamily: "inherit",
      lineHeight: "inherit",
    },
    ".cm-content": {
      minHeight: "1lh",
      padding: "0",
      caretColor: "currentColor",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-placeholder": {
      color: "var(--vscode-input-placeholderForeground, var(--cg-muted))",
    },
  });

  function emit(name: "input" | "change", text: string): void {
    const event = new CustomEvent(name, {
      detail: { value: text },
      bubbles: true,
    });
    wrapper?.dispatchEvent(event);
    if (name === "input") oninput?.(event);
    else onchange?.(event);
  }

  function emitChange(): void {
    if (value === lastCommitted) return;
    lastCommitted = value;
    emit("change", value);
  }

  export function focus(): void {
    if (disabled) return;
    view?.focus();
  }

  export function blur(): void {
    view?.contentDOM.blur();
  }

  export function close(): void {
    open = false;
  }

  export function openList(): void {
    if (disabled || readonly) return;
    const list = filterOptions(value);
    if (!list.length) return;
    filter = value;
    open = true;
    highlighted = 0;
    view?.focus();
  }

  function commit(option: NormalizedOption): void {
    if (disabled || readonly) return;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: option.value },
        selection: { anchor: option.value.length },
      });
      view.focus();
    } else {
      value = option.value;
      lastCommitted = value;
    }
    close();
    emitChange();
  }

  function tabComplete(): boolean {
    if (disabled || readonly) return false;
    if (open) {
      if (selectedOption) commit(selectedOption);
      else close();
      return true;
    }
    const list = filterOptions(value);
    if (!list.length) return false;
    if (list.length === 1) {
      commit(list[0]);
      return true;
    }
    openList();
    return true;
  }

  function move(delta: number): boolean {
    if (disabled || readonly) return false;
    if (!open) {
      openList();
      if (open && delta < 0) highlighted = Math.max(0, visibleOptions.length - 1);
      return true;
    }
    if (!visibleOptions.length) return true;
    highlighted =
      (highlighted + delta + visibleOptions.length) % visibleOptions.length;
    return true;
  }

  function submitOrClose(): boolean {
    if (open) {
      if (selectedOption) commit(selectedOption);
      close();
      return true;
    }
    emitChange();
    view?.contentDOM.closest("form")?.requestSubmit();
    return true;
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (!open) return;
    const path = event.composedPath();
    if (wrapper && !path.includes(wrapper)) close();
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!id || !(event.target instanceof Element)) return;
    const label = event.target.closest(`label[for="${CSS.escape(id)}"]`);
    if (!label) return;
    event.preventDefault();
    focus();
  }

  onMount(() => {
    if (!editorHost) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorState.transactionFilter.of(singleLineAndLimit),
        keymap.of([
          {
            key: "Tab",
            run: () => tabComplete(),
          },
          {
            key: "Shift-Tab",
            run: () => (open ? move(-1) : false),
          },
          {
            key: "ArrowDown",
            run: () => move(1),
          },
          {
            key: "ArrowUp",
            run: () => move(-1),
          },
          {
            key: "Enter",
            run: () => submitOrClose(),
          },
          {
            key: "Escape",
            run: () => {
              if (!open) return false;
              close();
              return true;
            },
          },
          {
            key: "Mod-Space",
            run: () => {
              openList();
              return true;
            },
          },
        ]),
        theme,
        editableCompartment.of(editableExtensions()),
        attrsCompartment.of(EditorView.contentAttributes.of(contentAttributes())),
        placeholderCompartment.of(cmPlaceholder(placeholder)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || syncing) return;
          const text = update.state.doc.toString();
          const changed = text !== value;
          if (changed) value = text;
          if (open) {
            filter = text;
            highlighted = 0;
          }
          if (changed) emit("input", text);
        }),
        EditorView.domEventHandlers({
          focus: (event) => {
            onfocus?.(event);
            return false;
          },
          blur: (event) => {
            close();
            emitChange();
            onblur?.(event);
            return false;
          },
        }),
      ],
    });
    view = new EditorView({ state, parent: editorHost });

    const onPointerDown = (event: PointerEvent) => onDocumentPointerDown(event);
    const onClick = (event: MouseEvent) => onDocumentClick(event);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);

    if (autofocus && !disabled) {
      requestAnimationFrame(() => focus());
    }

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      view?.destroy();
      view = undefined;
    };
  });

  $effect(() => {
    const next = value;
    if (!view) return;
    if (view.state.doc.toString() === next) return;
    syncing = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: next.length },
    });
    syncing = false;
    lastCommitted = next;
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: attrsCompartment.reconfigure(
        EditorView.contentAttributes.of(contentAttributes()),
      ),
    });
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure(editableExtensions()),
    });
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder)),
    });
  });

  $effect(() => {
    if (highlighted >= visibleOptions.length) {
      highlighted = Math.max(0, visibleOptions.length - 1);
    }
  });

  $effect(() => {
    if (open && visibleOptions.length === 0) open = false;
  });

  $effect(() => {
    if (!open) return;
    // Read the list so filtering also re-scrolls when the highlight is unchanged.
    void visibleOptions.length;
    const item = menu?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    if (!item || !menu) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
  });

</script>

<div
  class="code-input {className}"
  class:open
  class:disabled
  class:readonly
  {style}
  bind:this={wrapper}
  {...wrapperRest}
>
  <div
    class="field"
    role="presentation"
    onpointerdown={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button")) return;
      focus();
    }}
  >
    <div class="editor" bind:this={editorHost}></div>
    <button
      type="button"
      class="chevron"
      tabindex="-1"
      aria-label="Show completion options"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      title="Show completion options (Tab)"
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => (open ? close() : openList())}
    >v</button>
  </div>

  {#if open}
    <div class="menu" id={listId} role="listbox" bind:this={menu}>
      {#each visibleOptions as option, index (option.value + "\u0000" + index)}
        <button
          type="button"
          role="option"
          class="option"
          class:highlighted={index === highlighted}
          id={`${listId}-${index}`}
          tabindex="-1"
          aria-selected={index === highlighted}
          data-index={index}
          onpointerdown={(event) => event.preventDefault()}
          onclick={() => commit(option)}
        >
          <span class="option-label">{option.label}</span>
          {#if option.description}
            <span class="option-description">{option.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if name}
    <input
      type="hidden"
      {name}
      value={value}
      form={form || undefined}
      disabled={disabled || undefined}
      readonly={readonly || undefined}
      required={required || undefined}
      maxlength={maxlength}
      minlength={minlength}
      pattern={pattern}
      autocomplete={autocomplete as HTMLInputElement["autocomplete"]}
    />
  {/if}
</div>

<style>
  .code-input {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
    color: var(--vscode-input-foreground, var(--cg-text));
    font-family: var(--cg-font-mono);
    font-size: 0.9rem;
  }

  .field {
    display: flex;
    align-items: stretch;
    min-width: 0;
    min-height: 2lh;
    overflow: hidden;
    border: 1px solid var(--vscode-input-border, var(--cg-line));
    border-radius: 0.25rem;
    background: var(--vscode-input-background, var(--cg-bg));
  }

  .field:focus-within {
    border-color: var(--vscode-focusBorder, var(--cg-accent));
    outline: 1px solid var(--vscode-focusBorder, var(--cg-accent));
    outline-offset: -1px;
  }

  .editor {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .editor :global(.cm-editor) {
    flex: 1;
    width: 100%;
  }

  .editor :global(.cm-scroller) {
    padding: 0.45lh 0.75ch;
  }

  .editor :global(.cm-content) {
    font-family: var(--cg-font-mono);
    font-size: inherit;
    line-height: 1.35;
  }

  .chevron {
    display: grid;
    place-items: center;
    width: 3ch;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--vscode-input-border, var(--cg-line));
    background: transparent;
    color: var(--vscode-input-foreground, var(--cg-text));
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .open .chevron {
    transform: rotate(180deg);
  }

  .chevron:hover {
    background: var(--vscode-list-hoverBackground, var(--cg-panel));
  }

  .chevron:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, var(--cg-accent));
    outline-offset: -1px;
  }

  .menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.15lh);
    right: 0;
    left: 0;
    max-height: 12lh;
    overflow: auto;
    border: 1px solid var(--vscode-dropdown-border, var(--cg-line));
    border-radius: 0.25rem;
    background: var(--vscode-dropdown-background, var(--cg-panel));
    box-shadow: 0 0.4lh 1.2lh rgb(0 0 0 / 22%);
  }

  .option {
    display: flex;
    align-items: baseline;
    gap: 1ch;
    width: 100%;
    min-height: 1.8lh;
    padding: 0.2lh 0.75ch;
    border: 0;
    background: transparent;
    color: var(--vscode-dropdown-foreground, var(--cg-text));
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .option.highlighted {
    background: var(--vscode-list-activeSelectionBackground, var(--cg-accent));
    color: var(--vscode-list-activeSelectionForeground, var(--cg-accent-fg));
  }

  .option-label {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .option-description {
    margin-left: auto;
    overflow: hidden;
    color: var(--vscode-descriptionForeground, var(--cg-muted));
    font-size: 0.78em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option.highlighted .option-description {
    color: inherit;
    opacity: 0.8;
  }

  .disabled {
    opacity: 0.55;
  }

  .disabled .field {
    cursor: not-allowed;
  }

  .readonly .chevron {
    cursor: default;
  }
</style>
