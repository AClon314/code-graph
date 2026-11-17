<script module lang="ts">
  export type { CodeInputOption, CodeInputOptions } from "./code-input-options";
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
  } from "@codemirror/view";
  import { onMount, tick } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  import {
    resolveCodeInputOptions,
    type CodeInputOptions,
    type NormalizedCodeInputOption,
  } from "./code-input-options";
  import {
    codeInputTheme,
    codeInputTooltips,
    subscribeViewport,
  } from "./code-input-runtime";

  type NativeInputProps = Omit<
    HTMLInputAttributes,
    | "value"
    | "class"
    | "style"
    | "children"
    | "type"
    | "autocomplete"
    | "inputmode"
    | "spellcheck"
    | "oninput"
    | "onchange"
    | "onfocus"
    | "onblur"
    | "bind:value"
    | "bind:checked"
    | "bind:group"
    | "bind:files"
    | "bind:indeterminate"
  >;

  interface Props extends NativeInputProps {
    value?: string;
    options?: CodeInputOptions;
    /** Extra completion sources, e.g. from a language extension or plugin. */
    completionSources?: readonly CompletionSource[];
    /** Extra CodeMirror extensions. Language data completion sources work too. */
    extensions?: Extension;
    activateOnTyping?: boolean;
    /** Filter candidates by the current text; false shows all options. */
    filterOptions?: boolean;
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
  }

  let {
    value = $bindable(""),
    options = [],
    completionSources = [],
    extensions = [],
    activateOnTyping = false,
    filterOptions = true,
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
  let editorHost = $state<HTMLDivElement>();
  let view: EditorView | undefined;
  let syncing = false;
  let lastCommitted = value;
  let completionOpen = $state(false);
  let activated = $state(false);
  let activating = false;
  let pendingOpen = false;
  let fieldClickStartedFocused = false;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  let detachDocumentListeners: (() => void) | undefined;
  let unsubscribeViewport: (() => void) | undefined;

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

  /** Native-only props go to the idle <input>; data-* stays on the wrapper. */
  const nativeRest = $derived.by(() => {
    const attrs: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(
        ([key, raw]) =>
          !key.startsWith("data-") &&
          raw !== undefined &&
          raw !== null &&
          raw !== false,
      ),
    );
    if (inputmode) attrs.inputmode = inputmode;
    attrs.autocomplete = autocomplete;
    return attrs;
  });

  const wrapperRest = $derived.by(() =>
    Object.fromEntries(
      Object.entries(rest).filter(([key]) => key.startsWith("data-")),
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
  const optionsSource: CompletionSource = async (context) => {
    let normalized: NormalizedCodeInputOption[];
    try {
      normalized = await resolveCodeInputOptions(options);
    } catch (cause) {
      console.warn("CodeInput options provider failed", cause);
      return null;
    }
    if (!normalized.length) return null;
    const result = {
      from: 0,
      to: context.state.doc.length,
      options: normalized.map<Completion>((option) => ({
        label: option.label,
        apply: option.value,
        detail: option.description,
        type: "text",
      })),
    };
    return filterOptions
      ? { ...result, validFor: /^[\s\S]*$/ }
      : { ...result, filter: false };

  };

  const completionLanguageData = EditorState.languageData.of(() => [
    { autocomplete: optionsSource },
    ...completionSources.map((source) => ({ autocomplete: source })),
  ]);

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
    if (!activated) {
      activate(true);
      return;
    }
    view?.focus();
  }

  export function blur(): void {
    if (view) {
      view.contentDOM.blur();
    } else if (
      document.activeElement instanceof HTMLElement &&
      wrapper?.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }

  export function close(): void {
    pendingOpen = false;
    if (view) closeCompletion(view);
    completionOpen = false;
  }

  export function openList(): void {
    if (disabled || readonly) return;
    if (!activated) {
      pendingOpen = true;
      activate(true);
      return;
    }
    if (!view) {
      pendingOpen = true;
      return;
    }
    view.focus();
    startCompletion(view);
  }

  function activate(shouldFocus = true): void {
    if (disabled) return;
    if (activated) {
      if (shouldFocus) view?.focus();
      return;
    }
    if (activating) return;
    activating = true;
    activated = true;
    void tick().then(() => {
      activating = false;
      if (!activated || !editorHost) return;
      mountEditor();
      if (shouldFocus) view?.focus();
      if (pendingOpen && view) {
        pendingOpen = false;
        view.focus();
        startCompletion(view);
      }
    });
  }

  function deactivate(): void {
    clearTimeout(blurTimer);
    if (!activated) return;
    detachDocument();
    unsubscribeViewport?.();
    unsubscribeViewport = undefined;
    if (view) {
      view.destroy();
      view = undefined;
    }
    activated = false;
    completionOpen = false;
    pendingOpen = false;
  }

  function scheduleDeactivate(): void {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (!view || view.hasFocus) return;
      if (completionStatus(view.state) !== null) return;
      deactivate();
    }, 120);
  }

  function onNativeInput(event: Event): void {
    const next = (event.currentTarget as HTMLInputElement).value;
    value = next;
    emit("input", next);
  }

  function fieldTargetIsChevron(event: Event): boolean {
    const target = event.target;
    return target instanceof Element && target.closest(".chevron") !== null;
  }

  function onFieldPointerDown(event: PointerEvent): void {
    if (fieldTargetIsChevron(event)) return;
    fieldClickStartedFocused = Boolean(view?.hasFocus);
  }

  function onFieldClick(event: MouseEvent): void {
    if (fieldTargetIsChevron(event)) return;
    if (!fieldClickStartedFocused) return;
    fieldClickStartedFocused = false;
    if (completionOpen) close();
    else openList();
  }

  function onViewportChange(): void {
    if (view && completionStatus(view.state) !== null) {
      repositionTooltips(view);
    }
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

  function attachDocumentListeners(): void {
    if (detachDocumentListeners) return;
    const onClick = (event: MouseEvent) => onDocumentClick(event);
    const onPointerDown = (event: PointerEvent) => onDocumentPointerDown(event);
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onPointerDown, true);
    detachDocumentListeners = () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onPointerDown, true);
      detachDocumentListeners = undefined;
    };
  }

  function detachDocument(): void {
    detachDocumentListeners?.();
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

  function mountEditor(): void {
    if (!editorHost || view) return;
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
        codeInputTooltips,
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
        codeInputTheme,
        editableCompartment.of(editableExtensions()),
        attrsCompartment.of(
          EditorView.contentAttributes.of(contentAttributes()),
        ),
        placeholderCompartment.of(cmPlaceholder(placeholder)),
        EditorView.updateListener.of((update) => {
          completionOpen = completionStatus(update.state) !== null;
          // The completion extension also writes content attributes; keep the
          // combobox state in sync after its update.
          update.view.contentDOM.setAttribute(
            "aria-expanded",
            String(completionOpen),
          );

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
            clearTimeout(blurTimer);
            onfocus?.(event);
            return false;
          },
          blur: (event) => {
            emitChange();
            scheduleDeactivate();
            onblur?.(event);
            return false;
          },
        }),
        extensions,
      ],
    });
    view = new EditorView({ state, parent: editorHost });
    attachDocumentListeners();
    unsubscribeViewport = subscribeViewport(onViewportChange);
  }

  onMount(() => {
    if (autofocus && !disabled) activate(true);

    return () => {
      clearTimeout(blurTimer);
      deactivate();
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
  <div
    class="field"
    role="presentation"
    onpointerdown={onFieldPointerDown}
    onclick={onFieldClick}
  >
    {#if activated}
      <div class="editor" bind:this={editorHost}></div>
    {:else}
      <input
        class="native-input"
        id={id || undefined}
        value={value}
        placeholder={placeholder || undefined}
        disabled={disabled}
        readonly={readonly}
        required={required}
        maxlength={maxlength}
        minlength={minlength}
        pattern={pattern}
        form={form || undefined}
        spellcheck={spellcheck}
        {...nativeRest}
        oninput={onNativeInput}
        onfocus={() => activate(true)}
        onblur={(event) => {
          emitChange();
          onblur?.(event);
        }}
      />
    {/if}
    <button
      type="button"
      class="chevron"
      tabindex="-1"
      aria-label={completionOpen
        ? "Hide completion options"
        : "Show completion options"}
      aria-haspopup="listbox"
      aria-expanded={completionOpen}
      title={completionOpen
        ? "Hide completion options (Tab)"
        : "Show completion options (Tab)"}
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

  .native-input {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0.45lh 0.75ch;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.35;
  }

  .native-input::placeholder {
    color: var(--vscode-input-placeholderForeground, var(--cg-muted));
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

  /* The completion tooltip is owned and positioned by CodeMirror. The field
     does not clip it; the list width also follows the current visual viewport
     so pinch zoom cannot force it completely off-screen. */
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
    min-width: min(24ch, calc(var(--code-input-visual-width, 100vw) - 2ch)) !important;
    max-width: min(60ch, calc(var(--code-input-visual-width, 100vw) - 2ch)) !important;
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
