# Web e2e

Playwright drives the standalone browser shell against the offline `computed`
source, plus the local jump bridge.

```bash
bun run test:web
```

No cbm daemon or indexed project is required. Each test starts from a clean URL
and uses the browser's role/label locators. The server and bridge are started by
`playwright.web.config.ts`; set `CODE_GRAPH_WEB_TEST_PORT` to avoid a port clash.
