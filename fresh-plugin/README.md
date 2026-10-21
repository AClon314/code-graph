# fresh-plugin/ — QuickJS code navigator

`code-nav.ts` is the Fresh-side half of the TUI path. It runs inside Fresh's
QuickJS sandbox: **no npm imports, no Node APIs, no DOM**. All graph layout and
ANSI parsing happens outside, in `tui/render.ts`.

## What it does

- Registers mode `code-nav` and command **Code Nav: Open Graph**.
- Opens/creates a read-only virtual buffer named ` *Code Graph* ` in a right
  split (vertical divider).
- Reads the precomputed frame JSON and paints its styled runs as spans.
- Mouse click on a node box selects it (overlay + status `file:line`).
- `o` or `Enter` opens the selected node with `editor.openFile(file, line, 1)`.
- `r` runs the Bun renderer again, then re-reads the frame.
- `q` closes the panel (`close_buffer` binding).
- Polls the jump bridge every 500ms and opens incoming `JumpTarget`s.

## Install / symlink

```bash
# From the repository root.
export PATH="$HOME/.bun/bin:$PATH"
bash fresh-plugin/install.sh
```

The script:

1. `mkdir -p "$HOME/.config/fresh/plugins"` (or `$FRESH_CONFIG/plugins`);
2. symlinks `code-nav.ts` there;
3. renders a frame to `tui/frame.json` if it does not exist yet.

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
| `BRIDGE_TOKEN` | `CODE_NAV_TOKEN` | empty |
| `GUI_URL` | `CODE_NAV_GUI` | `http://127.0.0.1:5173` |
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

The GUI POSTs to `/jump`. The plugin polls:

```
GET /jump/next?client=fresh
  -> 200 JumpTarget { project, path, line, column?, symbol?, source? }
  -> 204 no pending jump
```

`httpFetch` writes the response body to `JUMP_TMP`; the plugin reads that file
only when `exit_code === 0`, so a 204 never reuses an old target. Repeated
identical targets are suppressed. Transport/HTTP errors are reported once in
the status line and then stay quiet until a successful poll. If a token is
configured, the poll sends `Authorization: Bearer <token>` via `httpFetch`
headers (never on a command line).

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
- QuickJS code cannot be type-checked with the repo's Svelte tsconfig. Syntax
  smoke test:

```bash
bun build fresh-plugin/code-nav.ts --target=browser --outfile=/tmp/code-nav.js
```
