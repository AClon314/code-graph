# fresh-plugin/ — QuickJS code navigator

`code-graph.ts` is the Fresh-side source for the TUI path. It runs inside Fresh's
QuickJS sandbox: **no runtime imports, no Node APIs, no DOM**. The shared host
adapter is bundled in; all graph layout and ANSI parsing happens outside, in
`tui/render.ts`.

## What it does

- Registers mode `code-graph` and two commands:
  **Code Graph: Open (cbm)** and **Code Graph: Open (SCIP)**.
- Opens/creates a read-only virtual buffer per backend and per window
  (` *Code Graph (cbm)* ` / ` *Code Graph (SCIP)* `) as a new tab in the
  current split (no split pane).
- Reads the precomputed frame JSON from the active workspace cache and paints
  its styled runs as spans.
- Mouse click on a node box selects it (overlay + status `file:line`).
- `o` or `Enter` opens the selected node through the shared `ExtensionApi`.
- `r` runs the Bun renderer again, then re-reads the frame (unless
  `CODE_NAV_FRAME_MODE=static`).
- `q` closes the panel (`close_buffer` binding).
- **Code Graph: Toggle Sync On Workspace Change** is OFF by default. When ON,
  switching Fresh windows opens the last-used backend panel in the new window
  in the background (no focus steal).
- Polls the jump bridge through `tools/jump-client.ts` and opens incoming
  `JumpTarget`s.

## Install / symlink

```bash
# From the repository root.
export PATH="$HOME/.bun/bin:$PATH"
bash fresh-plugin/install.sh
```

The script:

1. builds `out/fresh-plugin/code-graph.js` if missing;
2. `mkdir -p "$HOME/.config/fresh/plugins"` (or `$FRESH_CONFIG/plugins`);
3. symlinks the bundle there as `code-graph.ts` (plain JS, valid TS).

It does not delete anything and does not install a demo frame. To render the
fixture explicitly:

```bash
FRAME=/tmp/frame.json bash fresh-plugin/install.sh
```

The plugin normally creates per-workspace frames itself in cbm mode.

## Configure paths

Edit the constants at the top of `code-graph.ts`, or provide overrides on
`globalThis` from your plugin loader:

| Constant | `globalThis` override | Default |
| --- | --- | --- |
| `REPO` | `CODE_NAV_REPO` | this repository |
| `BUN` | `CODE_NAV_BUN` | `~/.bun/bin/bun` |
| `CBM_URL` | `CODE_NAV_CBM` | `http://127.0.0.1:9749` |
| `CBM_PROJECT` | `CODE_NAV_CBM_PROJECT` / `CODE_NAV_PROJECT` | `demo` |
| `SCIP_PROJECT` | `CODE_NAV_SCIP_PROJECT` | `<CBM_PROJECT>-scip` |
| `ENTRY` | `CODE_NAV_ENTRY` / `CODE_NAV_SYMBOL` | empty (must be set) |
| `FRAME_MODE` | `CODE_NAV_FRAME_MODE` | `cbm`; set `static` to force cache read |
| `DEPTH` | `CODE_NAV_DEPTH` | `2` |
| `DIRECTION` | `CODE_NAV_DIRECTION` | `both` |
| `MAX_NODES` | `CODE_NAV_MAX_NODES` | `60` |
| `BRIDGE_URL` | `CODE_NAV_BRIDGE` | `http://127.0.0.1:9752` |
| `PROJECT_ROOT` | `CODE_NAV_ROOT` | active Fresh window root |
| `JUMP_TMP` | `CODE_NAV_JUMP_TMP` | `/tmp/code-nav-jump.json` |

The frame cache is per workspace and backend:

```text
<workspace>/.codebase-memory/code-graph/cbm/frame.json
<workspace>/.codebase-memory/code-graph/scip/frame.json
```

After a successful render the plugin also creates a user-cache link:

```text
~/.cache/code-graph/frames/<root+backend hash>.json
  -> <workspace>/.codebase-memory/code-graph/<backend>/frame.json
```

`CODE_NAV_ENTRY` is intentionally explicit. cbm's `is_entry_point` is
heuristic (`main`, exported JS/TS functions, Make targets), not a language-aware
entry resolver. If it is missing, the plugin runs `tui/entries.ts`, lists the
candidates in a prompt, and uses the selected qualified name for this session.
You can also set `CODE_NAV_ENTRY` to skip the prompt. Do not assume a repository
has a single unique entry: C/C++, Go and Rust can have multiple binaries; Java
and Python commonly have multiple entry points.

`PROJECT_ROOT` prefixes repository-relative jump paths when set. If Fresh is
already running in the target repository root, the active window root is used.

## Jump bridge

Start the bridge in another terminal:

```bash
bun run jump:bridge
# optional:
CODE_NAV_PORT=9752 CODE_NAV_BIND=127.0.0.1 CODE_NAV_TOKEN=secret bun run jump:bridge
```

The GUI and VSCode send **JSON-RPC 2.0** to `POST /rpc`:

```json
{"jsonrpc":"2.0","id":1,"method":"jump.open","params":{"project":"p","path":"src/a.ts","line":3,"client":"fresh"}}
```

Fresh cannot use `editor.httpFetch` for this because that API is GET-only
(it streams a download to a file). The plugin instead spawns
`tools/jump-client.ts`, which performs the JSON-RPC POST:

```text
bun tools/jump-client.ts next --client fresh --wait 25000 --out /tmp/code-nav-jump.json
```

The helper writes the target (or `null` when the long poll elapses) atomically.
It reads the bearer token from `CODE_NAV_TOKEN` or `CODE_NAV_TOKEN_FILE`
(default `~/.config/code-nav/token`); never put the token in argv. Fresh
inherits its environment when spawning the helper, so exporting the token in
the editor's shell is enough. Repeated identical targets are suppressed.

Transport/HTTP errors are reported once in the status line and then stay quiet
until a successful poll.

## Limitations

- **No layout in the plugin.** QuickJS cannot import orchgraph/ELK; a frame must
  be rendered by Bun first. In `cbm` mode a missing frame is rendered once;
  in `static` mode it is an error with the cache path.
- **Module/folder view is not implemented.** The current view is funcs-only;
  folder roots, containment edges and expand/collapse are future work.
- **No embedded code editor.** Navigation is only `editor.openFile`; the GUI's
  jump protocol is the only coupling, by design.
- Overlay math assumes one cell per Unicode scalar; wide CJK labels can shift
  the selection overlay horizontally.
- The frame is painted in full (no paging/viewport), so keep `--max-nodes`
  modest for live cbm graphs.
- Reload keeps an existing ` *Code Graph* ` virtual buffer when possible, but
  content replacement invalidates old overlays; the plugin clears them.
- The plugin is bundled by `bun run build:fresh`; the source imports the shared
  `#host` alias, which esbuild resolves to `src/extension/hosts/fresh.ts`.
- QuickJS code cannot be type-checked with the repo's Svelte tsconfig. Syntax
  smoke test:

```bash
bun run build:fresh
```
