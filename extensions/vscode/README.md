# code-nav VSCode extension (SHELVED)

> **Shelved.** VSCode support is not part of the current implementation or
> test matrix. This adapter still speaks the retired v1 REST endpoint; do not
> install or test it until the TODO re-opens VSCode work and migrates it to
> `POST /rpc` JSON-RPC.

Thin adapter for the code-graph jump bridge. It does **not** embed an editor or
a graph view; it only receives `{project,path,line,column?}` and calls
`vscode.window.showTextDocument`.

## Build

From `graph-ui-svelte/`:

```bash
bun run --cwd extensions/vscode build
```

The compiled entry is `extensions/vscode/out/extension.js`.

## Install (development)

```bash
ln -s "$PWD/extensions/vscode" ~/.vscode/extensions/code-nav
```

Then reload VSCode. The extension polls `codeNav.bridgeUrl` (default
`http://127.0.0.1:9752`). Start the bridge with:

```bash
bun run jump:bridge
```

A fallback URI handler is also registered:

```text
vscode://code-nav.code-nav/open?project=demo&path=src/foo.ts&line=12&column=3
```

## Path and security rules

- Relative paths are resolved against the matching workspace folder, or the
  first folder when there is no project-name match.
- Absolute paths must be inside a workspace folder; otherwise the request is
  rejected.
- The jump bridge defaults to loopback. For LAN/Tailscale, bind it explicitly
  and set `codeNav.token` to the same `CODE_NAV_TOKEN`.

## Limitations

- No LSP; this is deliberately a small bridge adapter.
- Remote SSH/WSL needs the extension and bridge on the same host (or a
  reachable bridge URL); path mapping is workspace-folder based.
- No download/install packaging; this is a local development extension.
