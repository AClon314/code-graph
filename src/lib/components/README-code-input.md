# CodeInput (experimental)

An editable select/combobox backed by CodeMirror 6. The visible control is a
single-line editor with a `v` chevron; the same completion list is available
from the chevron and from <kbd>Tab</kbd>. Try it at `/debug`.

```svelte
<script lang="ts">
  import CodeInput from "#lib/components/CodeInput.svelte";
  let value = $state("ap");
  const options = ["apple", "appoint", "apply"];
</script>

<CodeInput id="fruit" name="fruit" bind:value {options} />
```

## Behaviour

- <kbd>Tab</kbd>: open the filtered list; with a single match, accept it. With
  the list open, <kbd>Tab</kbd> accepts the highlighted match.
- <kbd>↑</kbd>/<kbd>↓</kbd>: open the list and move the highlight.
- <kbd>Enter</kbd>: accept the highlighted match; with the list closed, submit
  the surrounding form (if any).
- <kbd>Esc</kbd>: close the list.
- Click the `v` chevron to open/close the same list.
- Clicking outside closes the list. Typing filters it while open.
- The list normally opens below the field. If it would cross the viewport
  bottom, it opens above instead (and returns below when a filtered list fits),
  matching CodeMirror's tooltip placement behavior. The check runs again on
  viewport resize and scroll. When `window.visualViewport` exists, its
  `offsetTop` / `height` define the visible bounds, so mobile pinch zoom, the
  URL bar, and the on-screen keyboard are included; `window.innerHeight` is
  only the fallback.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `value` | `string` | Bindable. Also accepts external updates. |
| `options` | `string[] \| { value, label?, description? }[]` | Completion candidates. |
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
| `aria-*` / `data-*` / `title` | native values | Editor ARIA/title attributes; other data attributes go to the wrapper. |

Native constraint validation is intentionally not reimplemented on the
contenteditable editor. `required`, `pattern`, and length attributes are
available on the hidden value input for progressive enhancement, but a consumer
that submits a form should validate the bound value itself.

## Implementation notes

`CodeInput` uses `@codemirror/state` + `@codemirror/view` only: no
`@codemirror/autocomplete`, because the popup is a controlled DOM list styled
like the TUI reference (`| value | v |` + rows). CodeMirror owns caret, IME,
selection, and keyboard input; Svelte owns the list, ARIA state, and styling.
Newlines are collapsed to spaces and `maxlength` is enforced by a transaction
filter.
