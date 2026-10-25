# Testing the GUI in VS Code for the Web

> Target: `bun run gui` starts VS Code for the Web with the extension loaded, so the
> webview can be exercised without a separate browser shell. TUI/Fresh remains a
> separate path.

## Official harness: `@vscode/test-web`

[`microsoft/vscode-test-web`](https://github.com/microsoft/vscode-test-web) is the
official Node module for running a web extension locally. It downloads a VS Code
for the Web build, serves it, loads the extension under development, and launches
a browser through Playwright.

CLI shape:

```bash
bunx @vscode/test-web \
  --browser=chromium \
  --extensionDevelopmentPath=. \
  ./fixtures/workspace
```

The positional `folderPath` opens a local folder as a virtual workspace
(`vscode-test-web://mount`). Edits live in memory and are not written back.

Key options (from the package README and CLI):

| Option | Meaning |
|---|---|
| `--browser=chromium\|firefox\|webkit\|none` | Browser to launch. `none` serves without launching. |
| `--extensionDevelopmentPath=<path>` | Folder containing the extension `package.json` under development. |
| `--extensionTestsPath=<path>` | Module exporting `run()`; runs extension tests in the web extension host. |
| `--quality=insiders\|stable` | VS Code build. Defaults to `insiders`. |
| `--headless` | Hide the browser; defaults to true when tests are supplied. |
| `--port=3000` | Local server port. |
| `--host=localhost` | Bind host. |
| `--browserOption=<arg>` | Extra browser flag, repeatable. |
| `--extensionPath=<path>` | Additional extension folder, repeatable. |
| `--extensionId=<publisher.name>` | Install a Marketplace extension into the test instance. |
| `--coi` | Enable cross-origin isolation (for SharedArrayBuffer/threads). |
| `--open-devtools` | Open DevTools in Chromium. |
| `--verbose` | Print browser console output to the terminal. |
| `--sourcesPath=<path>` | Run against locally built VS Code sources instead of a downloaded build. |

`--browserType=...` is also accepted as an alias for `--browser=...`.

## Suggested scripts

```json
{
  "scripts": {
    "build:extension": "bun run compile-web",
    "build:webview": "vite build --config vite.webview.config.ts",
    "build": "bun run build:extension && bun run build:webview",
    "watch:webview": "vite build --config vite.webview.config.ts --watch",
    "gui": "bun run build && bunx @vscode/test-web --browser=chromium --quality=stable --extensionDevelopmentPath=. ./fixtures/workspace",
    "gui:headless": "bun run build && bunx @vscode/test-web --browser=chromium --headless --extensionDevelopmentPath=. ./fixtures/workspace"
  }
}
```

The first `gui` run downloads the VS Code web build into `.vscode-test-web/`
(already ignored). Subsequent runs reuse it.

If the extension should open the graph automatically for GUI testing, gate it:

```ts
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("codeGraph.show", () => showGraphPanel(context)),
  );

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    void vscode.commands.executeCommand("codeGraph.show");
  }
}
```

Otherwise launch the command manually from the Command Palette.

## What `@vscode/test-web` can and cannot test

It can test:

- Extension activation, commands, contributions, `workspace.fs`, TreeView data.
- Webview creation and the extension side of `postMessage`.
- Web extension compatibility (no Node APIs, single-file bundle).

It cannot directly assert the DOM inside the webview from an extension test: the
webview is a separate iframe/context. Use Playwright for that.

### Playwright against the webview

Option A: let `vscode-test-web` launch Chromium, and connect Playwright over CDP.
The CLI supports `--waitForDebugger=<port>`, which starts Chromium with
`--remote-debugging-port=<port>`. Use `chromium.connectOverCDP(...)`.

Option B: serve without launching, then drive the page yourself:

```ts
import { open } from "@vscode/test-web";
import { chromium } from "playwright";

const server = await open({
  browserType: "none",
  extensionDevelopmentPath: process.cwd(),
  folderPath: "fixtures/workspace",
  quality: "stable",
  port: 3000,
  host: "127.0.0.1",
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000");
// The workbench is the top page; the webview is an iframe.
// await page.frameLocator("iframe.webview").locator("#app").waitFor();

await browser.close();
await server.dispose();
```

Use the actual VS Code webview iframe selector for the version under test; it has
changed over time. Prefer role/text locators inside the frame over brittle class
names.

### CORS and the CBM API

In vscode.dev, both the web extension host and the webview are browser contexts.
`fetch` to a local CBM server is subject to CORS. Options:

1. Add CORS headers to the CBM server (production-friendly).
2. Put CBM behind a same-origin HTTPS proxy.
3. For local testing only, launch Chromium with
   `--browserOption=--disable-web-security` (the official README documents this
   for external network access). Never ship that flag.
4. Ship a desktop `main` entry for Node-side fetching, while `browser` remains the
   web path.

This is the main architectural difference from the old Vite dev proxy: a webview
has no `/api` proxy. The extension host can act as the proxy (webview ->
`postMessage` -> extension `fetch`), but in a web extension that `fetch` is still
subject to CORS.

## Extension test entry

`ext-command-web` generates `src/web/test/suite/index.ts` with a `run()` export.
Point `--extensionTestsPath` at the bundled output:

```bash
bunx @vscode/test-web \
  --browser=chromium \
  --headless \
  --extensionDevelopmentPath=. \
  --extensionTestsPath=dist/web/test/suite/index.js
```

The tests run inside the web extension host. They can call commands and inspect
extension-side state; they cannot query webview DOM.

## Why not keep the old Vite dev server?

- The old flow served a standalone HTML app and proxied `/api`. That app owned the
  whole page, including its own file tree.
- The new flow is a VS Code extension: VS Code owns the shell, Explorer, editors,
  and command palette. The webview is only the graph surface.
- `vscode-test-web` is the supported way to load that extension into a real
  VS Code for the Web build. It also exercises web-extension restrictions (no
  Node, single-file bundle, virtual FS) that a plain Vite server would hide.

## Checklist for the first green run

- [ ] `package.json` has `browser` pointing at the bundled extension entry.
- [ ] `engines.vscode` is <= the build selected by `--quality`.
- [ ] Webview assets are built into `dist/webview/` and referenced with
      `asWebviewUri`, never by relative path.
- [ ] CSP allows only `webview.cspSource` (plus the font CDN if used).
- [ ] `codeGraph.show` opens the panel; in development it can auto-open.
- [ ] `@vscode/test-web` loads the extension without "not a web extension" errors.
- [ ] Playwright can find the webview iframe and the Svelte `#app` root.
- [ ] CBM requests work with CORS, or the test uses a documented local-only flag.
