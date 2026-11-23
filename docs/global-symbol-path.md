# Global symbol path

The path bar and forAI payloads use a filesystem-based symbol identity instead
of a backend qualified name:

```text
<cwd>//<file-relative-to-cwd>#<symbol-unique-in-file>
```

Examples:

```text
/home/me/gpen-js//src/lib/Button.svelte#Button.toggle
gpen-js//src/lib/Button.svelte#Button.toggle   # compact display
gpen-js                                         # cwd only (all roots)
```

`//` is used because POSIX shells resolve it like `/`; the full string remains
usable in a terminal while being unambiguous next to an absolute folder path.
The compact form hides the absolute folder for screenshots and AI output. The
path bar expands to the full form when focused.

## Code

`src/lib/symbol-path.ts` is the value object and parser:

```ts
const path = new GlobalSymbolPath("gpen-js//src/main.ts#main", cwd);
path.toString();   // full canonical form
path.toDisplay();  // compact privacy-preserving form
path.toLocation(3, 20); // src/main.ts#L3C20
```

The class is the JS counterpart of a Python `Symbol` object. It is named
`GlobalSymbolPath`, not `Symbol`, to avoid shadowing JavaScript's built-in
`Symbol`. `src/lib/state/symbol-path-entry.ts` resolves a parsed path against
the current graph/root candidates and writes the backend QN back to
`setup.entry`; `setup.path` keeps the canonical filesystem value.

## Markdown/JSON

`src/lib/ai-context.ts` builds both formats from one bundle. Markdown uses
headings for folder/file/anchor and links callers/callees with
`file#L<line>C<column>` targets; JSON keys use compact global paths:

```json
{
  "self": "gpen-js//src/main.ts#main",
  "location": "src/main.ts#L3C20",
  "callers": {},
  "callees": {}
}
```

Legacy backend QNs and `#id` entries remain accepted in the path bar for
compatibility. The URL/config continue to store the backend QN; only the
display/copy layer is filesystem-based.
