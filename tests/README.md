# Tests

| Layer | Location | Command | Purpose |
| --- | --- | --- | --- |
| Unit | `tests/*.test.ts` | `bun run test` | Pure graph/URL/config/CLI/host logic |
| Web e2e | `tests/web` | `bun run test:web` | Browser user journey, offline `computed` source |
| VS Code e2e | `tests/vscode` | `bun run test:vscode` | code-server + webview + editor jump |
| Fresh e2e | `tests/fresh` | `bun run test:fresh` | Real PTY via `@microsoft/tui-test` |
| All e2e | — | `bun run test:e2e` | Web + Fresh + VS Code |

The suite is intentionally weighted toward unit tests: they are fast and cover
the graph/BFS/layout edge cases that a UI smoke test cannot. E2E is reserved for
cross-runtime journeys, browser console errors, and integration wiring.

See [`e2e/README.md`](e2e/README.md) for the shared journey matrix and rules
(semantic selectors, console warnings vs errors, timing budgets, idempotence).
