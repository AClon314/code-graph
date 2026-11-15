<script module lang="ts">
  export type CodeInputOption =
    | string
    | {
        value: string;
        label?: string;
        description?: string;
      };
</script>

<script lang="ts">
  import {
    acceptCompletion,
    autocompletion,
    closeCompletion,
    completionStatus,
    moveCompletionSelection,
    pickedCompletion,
    startCompletion,
    type Completion,
    type CompletionSource,
  } from "@codemirror/autocomplete";
  import {
    Compartment,
    EditorState,
    type Extension,
    type Transaction,
  } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    placeholder as cmPlaceholder,
    repositionTooltips,
    tooltips,
  } from "@codemirror/view";
  import { onMount } from "svelte";

  interface Props {
    value?: string;
    options?: readonly CodeInputOption[];
    /** Extra completion sources, e.g. from a language extension or plugin. */
    completionSources?: readonly CompletionSource[];
    /** Extra CodeMirror extensions. Language data completion sources work too. */
    extensions?: Extension;
    activateOnTyping?: boolean;
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
    completionSources = [],
    extensions = [],
    activateOnTyping = false,
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

  let wrapper: HTMLDivElement | undefined;
  let editorHost: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let syncing = false;
  let lastCommitted = value;
  let completionOpen = $state(false);

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

  /**
   * The `options` prop is exposed as a normal CodeMirror completion source.
   * It is published through language data (rather than autocompletion's
   * `override`) so community plugins can contribute their own sources too.
   */
  const optionsSource: CompletionSource = (context) => {
    if (!normalizedOptions.length) return null;
    return {
      from: 0,
      to: context.state.doc.length,
      options: normalizedOptions.map<Completion>((option) => ({
        label: option.label,
        apply: option.value,
        detail: option.description,
        type: "text",
      })),
      validFor: /^[\s\S]*$/,
    };
  };

  const completionLanguageData = EditorState.languageData.of(() => [
    { autocomplete: optionsSource },
    ...completionSources.map((source) => ({ autocomplete: source })),
  ]);

  function visibleTooltipSpace() {
    const vv = window.visualViewport;
    if (vv) {
      return {
        top: vv.offsetTop,
        left: vv.offsetLeft,
        right: vv.offsetLeft + vv.width,
        bottom: vv.offsetTop + vv.height,
      };
    }
    const root = document.documentElement;
    return {
      top: 0,
      left: 0,
      right: root.clientWidth,
      bottom: root.clientHeight,
    };
  }

  function contentAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {
      ...editorRest,
      role: "combobox",
      "aria-expanded": String(completionOpen),
    };
    if (id) attrs.id = id;
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
    if (view) closeCompletion(view);
    completionOpen = false;
  }

  export function openList(): void {
    if (disabled || readonly || !view) return;
    view.focus();
    startCompletion(view);
  }

  function tabComplete(editor: EditorView): boolean {
    if (disabled || readonly) return false;
    const status = completionStatus(editor.state);
    if (status === "active" && acceptCompletion(editor)) return true;
    if (status === "pending") return true;
    return startCompletion(editor);
  }

  function shiftTab(editor: EditorView): boolean {
    return completionStatus(editor.state) === "active"
      ? moveCompletionSelection(false)(editor)
      : false;
  }

  function submitForm(editor: EditorView): boolean {
    if (completionStatus(editor.state) !== null) return false;
    editor.contentDOM.closest("form")?.requestSubmit();
    return true;
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!id || !(event.target instanceof Element)) return;
    const label = event.target.closest(`label[for="${CSS.escape(id)}"]`);
    if (!label) return;
    event.preventDefault();
    focus();
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    if (!view || completionStatus(view.state) === null) return;
    const path = event.composedPath();
    if (
      path.some(
        (node) =>
          node instanceof Element &&
          node.classList.contains("cm-tooltip-autocomplete"),
      )
    ) {
      return;
    }
    if (wrapper && !path.includes(wrapper)) close();
  }

  onMount(() => {
    if (!editorHost) return;
    // A zero-size fixed host keeps tooltip containers out of body flow. Passing
    // document.body directly would let CM's theme classes add viewport-height
    // blocks to the page for every input.
    const tooltipHost = document.createElement("div");
    tooltipHost.className = "code-input-tooltip-host";
    tooltipHost.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:auto;z-index:50";
    document.body.appendChild(tooltipHost);

    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorState.transactionFilter.of(singleLineAndLimit),
        completionLanguageData,
        autocompletion({
          activateOnTyping,
          closeOnBlur: true,
          defaultKeymap: true,
          selectOnOpen: true,
          interactionDelay: 0,
          aboveCursor: false,
          icons: false,
          tooltipClass: () => "code-input-completions",
        }),
        tooltips({
          parent: tooltipHost,
          tooltipSpace: visibleTooltipSpace,
        }),
        keymap.of([
          {
            key: "Tab",
            run: (editor) => tabComplete(editor),
          },
          {
            key: "Shift-Tab",
            run: (editor) => shiftTab(editor),
          },
          {
            key: "Enter",
            run: (editor) => submitForm(editor),
          },
        ]),
        theme,
        editableCompartment.of(editableExtensions()),
        attrsCompartment.of(
          EditorView.contentAttributes.of(contentAttributes()),
        ),
        placeholderCompartment.of(cmPlaceholder(placeholder)),
        EditorView.updateListener.of((update) => {
          completionOpen = completionStatus(update.state) !== null;

          if (update.docChanged && !syncing) {
            const text = update.state.doc.toString();
            const changed = text !== value;
            if (changed) value = text;
            if (changed) emit("input", text);
          }

          if (
            update.transactions.some((tr) =>
              tr.annotation(pickedCompletion),
            )
          ) {
            queueMicrotask(emitChange);
          }
        }),
        EditorView.domEventHandlers({
          focus: (event) => {
            onfocus?.(event);
            return false;
          },
          blur: (event) => {
            emitChange();
            onblur?.(event);
            return false;
          },
        }),
        extensions,
      ],
    });
    view = new EditorView({ state, parent: editorHost });

    const onClick = (event: MouseEvent) => onDocumentClick(event);
    const onPointerDown = (event: PointerEvent) => onDocumentPointerDown(event);
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown, true);
    const reposition = () => {
      if (view) repositionTooltips(view);
    };
    const vv = window.visualViewport;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    vv?.addEventListener("resize", reposition);
    vv?.addEventListener("scroll", reposition);

    if (autofocus && !disabled) {
      requestAnimationFrame(() => focus());
    }

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      vv?.removeEventListener("resize", reposition);
      vv?.removeEventListener("scroll", reposition);
      view?.destroy();
      view = undefined;
      tooltipHost.remove();
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
</script>

<div
  class="code-input {className}"
  class:disabled
  class:readonly
  {style}
  bind:this={wrapper}
  {...wrapperRest}
>
  <div class="field" role="presentation">
    <div class="editor" bind:this={editorHost}></div>
    <button
      type="button"
      class="chevron"
      tabindex="-1"
      aria-label="Show completion options"
      aria-haspopup="listbox"
      aria-expanded={completionOpen}
      title="Show completion options (Tab)"
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => (completionOpen ? close() : openList())}
    >v</button>
  </div>

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

  .chevron:hover {
    background: var(--vscode-list-hoverBackground, var(--cg-panel));
  }

  .chevron:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, var(--cg-accent));
    outline-offset: -1px;
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

  /* The completion tooltip is owned and positioned by CodeMirror. It lives in
     document.body so the field's overflow clip cannot cut it off. */
  :global(.cm-tooltip.code-input-completions) {
    z-index: 50;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--vscode-dropdown-border, var(--cg-line));
    border-radius: 0.25rem;
    background: var(--vscode-dropdown-background, var(--cg-panel));
    color: var(--vscode-dropdown-foreground, var(--cg-text));
    box-shadow: 0 0.4lh 1.2lh rgb(0 0 0 / 22%);
  }

  :global(.code-input-completions.cm-tooltip-autocomplete > ul) {
    min-width: min(24ch, 88vw);
    max-width: min(60ch, 92vw);
    max-height: 12lh;
    margin: 0;
    padding: 0;
  }

  :global(.code-input-completions.cm-tooltip-autocomplete > ul > li) {
    min-height: 1.8lh;
    padding: 0.2lh 0.75ch;
    font-family: var(--cg-font-mono);
    font-size: 0.9rem;
    line-height: 1.35;
  }

  :global(.code-input-completions.cm-tooltip-autocomplete > ul > li[aria-selected]) {
    background: var(--vscode-list-activeSelectionBackground, var(--cg-accent));
    color: var(--vscode-list-activeSelectionForeground, var(--cg-accent-fg));
  }

  :global(.code-input-completions .cm-completionMatchedText) {
    text-decoration: none;
    font-weight: 600;
  }

  :global(.code-input-completions .cm-completionDetail) {
    margin-left: 1ch;
    color: var(--vscode-descriptionForeground, var(--cg-muted));
    font-style: normal;
    font-size: 0.82em;
  }

  :global(.code-input-completions .cm-tooltip-autocomplete-disabled > ul > li[aria-selected]) {
    background: var(--cg-line);
    color: var(--cg-muted);
  }
</style>
