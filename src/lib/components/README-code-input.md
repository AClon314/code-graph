# CodeInput (experimental)

An editable select/combobox backed by CodeMirror 6. The visible control is a
single-line field with a `v` chevron; completion is provided by the official
`@codemirror/autocomplete` list and tooltip. Try it at `/debug`.

Instances are lazy: an idle field is a native `<input>`, and its CodeMirror
`EditorView` is created on focus and destroyed shortly after blur. A page with
100 fields therefore normally has zero editors, not 100; only the focused field
pays the CodeMirror/tooltip cost.

```svelte
<script lang="ts">
  import CodeInput from "#lib/components/CodeInput.svelte";
  let value = $state("ap");
  const options = ["apple", "appoint", "apply"];
</script>

<CodeInput id="fruit" name="fruit" bind:value {options} />
```

## Behaviour

- Idle fields use a native input; focusing one mounts CodeMirror. Leaving a
  field destroys its editor after a short delay (value and props survive).
- <kbd>Tab</kbd>: start completion; with the list open, accept the selected
  match.
- <kbd>Shift</kbd> + <kbd>Tab</kbd>: move the selection up while open.
- <kbd>↑</kbd>/<kbd>↓</kbd>: move the selection while open.
- <kbd>Enter</kbd>: accept the selected match; with the list closed, submit
  the surrounding form (if any).
- <kbd>Esc</kbd>: close the list.
- The first click/tap on an idle field only focuses it and mounts the editor.
  Click/tap the focused field again to show completion; another click hides it.
  This is especially useful on mobile after pinch zoom, where the in-field
  chevron may be outside the visual viewport.
- Click the `v` chevron to show/hide completion directly.
- Clicking outside closes the list. Typing filters it while open (and opens it
  automatically when `activateOnTyping` is true).
- The list uses CodeMirror's tooltip placement: below the cursor by default,
  flipping above when it would cross the viewport bottom, with automatic height
  clamping. The list has no artificial line cap: it shows every candidate while
  it fits, and only scrolls once CodeMirror clamps the tooltip to the visual
  viewport. `tooltipSpace` is bound to `window.visualViewport` when available,
  and `repositionTooltips` is called on visualViewport resize/scroll, so mobile
  pinch zoom, URL-bar changes, and the software keyboard are accounted for.
- The list width is capped to the visual viewport width so pinch zoom cannot
  push it off-screen. There is no separate pinned chevron: after focusing a
  field, a second click/tap on the field toggles the list.
- When a query has no candidate, the source supplies a synthetic **Clear
  input** item. It clears the bound value when clicked; accepting it with
  Enter only closes the list, so a free-form value is not lost accidentally.
  Shift+Backspace clears the single-line value through both the editor and the
  idle native input.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `string` | Bindable. Also accepts external updates. |
| `options` | `CodeInputOption[] \| (() => CodeInputOption[] \| Promise<CodeInputOption[]>)` | Static candidates or a lazy provider. The provider is called whenever CodeMirror requests completions (and may run again while the list stays open), so it can read current state or fetch a list; sync and async results are supported. Cache expensive lookups inside the provider. |
| `completionSources` | `CompletionSource[]` | Extra sources, merged through language data. |
| `extensions` | `Extension` | Extra CodeMirror extensions, including community completion/language extensions. |
| `activateOnTyping` | `boolean` | Let autocomplete start while typing; default `false` (Tab/chevron/field click). |
| `filterOptions` | `boolean` | Filter candidates against the current text; default `true`. Set `false` for select-like fields where a prefilled value should not hide the full list. |
| `debounce` | `number` | Milliseconds to wait after typing before emitting `commit`; default `0` (disabled). |
| `oncommit` | `(event) => void` | Called after the debounce (or on blur) with a bubbling `commit` event carrying `detail.value`; blank values are not committed. |
| `name` | `string` | Adds a hidden form value input. |
| `id` | `string` | Applied to the CodeMirror content. |
| `form` | `string` | Associates the hidden value input with a form. |
| `placeholder` | `string` | Empty-editor placeholder. |
| `disabled` / `readonly` | `boolean` | Native-like disabled/read-only state. |
| `required` | `boolean` | Sets `aria-required` and the hidden input attribute. |
| `autofocus` | `boolean` | Focuses after mount. |
| `maxlength` / `minlength` | `number` | `maxlength` is enforced while typing; both are forwarded to the hidden input. |
| `pattern` | `string` | Forwarded to the hidden input. |
| `autocomplete` | `string` | Forwarded to the hidden input; default `off`. |
| `inputmode` | `string` | Applied to the editor content. |
| `spellcheck` | `boolean \| "true" \| "false"` | Applied to the editor content. |
| `class` / `style` | `string` | Wrapper styling. |
| `oninput` / `onchange` | `(event: Event) => void` | Receives a bubbling `CustomEvent` with `detail.value`. |
| native `<input>` props | `HTMLInputAttributes` | Typed native attributes (`size`, `list`, `autocapitalize`, `aria-*`, keyboard handlers, …). They are applied to the idle native input and mirrored to the editor when meaningful (`aria-*`, `title`, `inputmode`, …). `data-*` stays on the wrapper. Attributes such as `size`/`list`/`min`/`max`/`step` only affect the idle input, not the CodeMirror content. `type` is intentionally not exposed: the control is text-only. |

Native constraint validation is intentionally not reimplemented on the
contenteditable editor. `required`, `pattern`, and length attributes are
available on the hidden value input for progressive enhancement, but a consumer
that submits a form should validate the bound value itself.

## Integration

`options` is exposed through `EditorState.languageData` as an `autocomplete`
source rather than as `autocompletion({override: [...]})`. That means sources
registered by language extensions and community plugins are combined with the
component's own options:

```svelte
<CodeInput
  options={() => currentRoots}
  extensions={myLanguageExtension}
  completionSources={[myCompletionSource]}
/>
```

`options` can also be async when the candidates come from an API. Normalization
lives in `code-input-options.ts`; providers are evaluated lazily rather than
when the component mounts. Types are exported from the component module:

```svelte
<script lang="ts">
  import CodeInput, {
    type CodeInputOption,
    type CodeInputOptions,
  } from "#lib/components/CodeInput.svelte";
</script>
```

The official completion keymap is enabled. `interactionDelay` is set to `0`
because this control is a small select rather than a code editor, and `Tab` is
mapped to start/accept completion. The field does not clip the tooltip, and the
tooltip width is capped with `--code-input-visual-width` (updated from
`visualViewport.width`) so a pinch cannot push the whole list off-screen.
There is no zoom-pinned chevron; a click on the focused field toggles the list.
Theme, tooltip config, and window/visualViewport listeners are shared by all
instances in `code-input-runtime.ts`; only `EditorView` and plugin views remain
per active field. Native/editor attribute splitting and lazy option resolution
keep the component's prop surface predictable. Styling hooks:
`.cm-tooltip.code-input-completions`, `.cm-completionLabel`,
`.cm-completionDetail`, and the selected `li[aria-selected]`.


## Layout snippets

CodeInput exposes three Svelte snippets for layout composition:

```svelte
<CodeInput>
  {#snippet start()}<span class="prefix">A</span>{/snippet}
  {#snippet afterInput()}<button type="button">+</button>{/snippet}
  {#snippet end()}<span class="suffix">C</span>{/snippet}
</CodeInput>
```

`start` is outside the field, `afterInput` sits between the editor and the
chevron, and `end` is after the field. The path bar uses `afterInput` for its
new-index button.
