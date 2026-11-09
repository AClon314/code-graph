# VS Code / code-server e2e

code-server has no desktop-style extension test API. Playwright drives the real
web UI, command palette, and webview instead.

```bash
bun run test:vscode
```

The `webServer` entry starts the isolated code-server profile from
`scripts/gui.sh`; it disables cbm autostart and the fixture workspace selects
`codeGraph.source = "mock"`, so this smoke test needs no daemon.
