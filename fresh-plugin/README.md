# fresh-plugin/ — QuickJS code navigator

`code-nav.ts` is the Fresh-side source for the TUI path. It runs inside Fresh's
QuickJS sandbox: **no runtime imports, no Node APIs, no DOM**. The shared host
adapter is bundled in; all graph layout and ANSI parsing happens outside, in
`tui/render.ts`.

## What it does

- Registers mode `code-nav` and command **Code Nav: Open Graph**.
- Opens/creates a read-only virtual buffer named ` *Code Graph* ` as a new
  tab in the current split (no split pane).
- Reads the precomputed frame JSON and paints its styled runs as spans.
- Mouse click on a node box selects it (overlay + status `file:line`).
- `o` or `Enter` opens the selected node through the shared `ExtensionApi`.
- `r` runs the Bun renderer again, then re-reads the frame.
- `q` closes the panel (`close_buffer` binding).
- Polls the jump bridge through `tools/jump-client.ts` and opens incoming
  `JumpTarget`s.

## Install / symlink

```bash
# From the repository root.
export PATH="$HOME/.bun/bin:$PATH"
bash fresh-plugin/install.sh
```

The script:

1. builds `fresh-plugin/dist/code-nav.js` if missing;
2. `mkdir -p "$HOME/.config/fresh/plugins"` (or `$FRESH_CONFIG/plugins`);
3. symlinks the bundle there as `code-nav.ts` (plain JS, valid TS);
4. renders a frame to `tui/frame.json` if it does not exist yet.

It does not delete anything. Override paths with environment variables:

```bash
FRESH_CONFIG=/path/to/fresh-config \
BUN="$HOME/.bun/bin/bun" \
FRAME=/path/to/frame.json \
FORCE=1 \
bash fresh-plugin/install.sh
```

`FORCE=1` re-renders the fixture frame even if one already exists. A real cbm
frame should be generated with the commands in `../tui/README.md`.

## Configure paths

Edit the constants at the top of `code-nav.ts`, or provide overrides on
`globalThis` from your plugin loader:

| Constant | `globalThis` override | Default |
| --- | --- | --- |
| `REPO` | `CODE_NAV_REPO` | this repository |
| `BUN` | `CODE_NAV_BUN` | `~/.bun/bin/bun` |
| `FRAME_PATH` | `CODE_NAV_FRAME` | `<REPO>/tui/frame.json` |
| `BRIDGE_URL` | `CODE_NAV_BRIDGE` | `http://127.0.0.1:9752` |
| `PROJECT_ROOT` | `CODE_NAV_ROOT` | empty |
| `JUMP_TMP` | `CODE_NAV_JUMP_TMP` | `/tmp/code-nav-jump.json` |
| `RENDER_ARGS` | `CODE_NAV_RENDER_ARGS` | fixture graph → `FRAME_PATH` |

`RENDER_ARGS` is what `r` executes. To use live cbm data, replace the fixture
arguments with, for example:

```ts
const DEFAULT_RENDER_ARGS = [
  RENDER_SCRIPT,
  "--cbm", "http://127.0.0.1:9749",
  "--project", "my-project",
  "--symbol", "pkg.mod.fn",
  "--depth", "2",
  "--direction", "both",
  "--out", FRAME_PATH,
];
```

`PROJECT_ROOT` prefixes repository-relative jump paths when set. If Fresh is
already running in the target repository root, leaving it empty is fine.

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
  be rendered by Bun first. Missing frame → status prompt, press `r`.
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
