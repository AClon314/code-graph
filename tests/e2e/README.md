# End-to-end tests

The same user journey is checked through the three shells that share `App.svelte`:

| Journey step | Web (`tests/web`) | VS Code webview (`tests/vscode`) | Fresh (`tests/fresh`) |
| --- | --- | --- | --- |
| Open a project/graph | context chip + graph root | command palette + webview | `Code Graph: Open (cbm)` |
| Open setup | Setup panel | Setup panel | `[E] Entry` picker |
| Search | search field + Enter | search field + Enter | terminal node click (no search field) |
| Inspect | node → details | node → details | node click → status line |
| Jump | Jump → bridge receipt | Jump → editor tab | node + `o` → file tab |

## Performance data

The web suite uses `playwright-performance-reporter` (CDP) in addition to
Playwright's official `trace: "retain-on-failure"`. Each `timed()` step is a
Playwright `test.step`, so the reporter writes per-step CPU profile summaries,
Web Vitals, long tasks, heap samples, and navigation timing to:

```text
test-results/performance/web.json   raw per-test/per-step metrics
test-results/performance/web.html   Chart.js metrics report
```

Chrome Performance traces are opt-in because they are large and slow:

```bash
bun run test:web:perf
# then open test-results/performance/traces/*.json.gz in DevTools > Performance
```

The reporter requires Chromium and one worker; both are already configured in
`playwright.web.config.ts`. `CODE_GRAPH_PERF_PORT` selects the CDP port
(default `9222`). Performance metrics are passive: they never fail a test.

`timed()` is now only a wall-clock policy guard: it creates the `test.step`
(so the reporter can measure it) and emits a warning above the budget. Step
durations and browser metrics themselves come from the performance report, not
from a second custom collector.

Rules for new tests:

- Prefer role/name/label selectors (`getByRole`, `getByLabel`, `getByText`), not CSS classes.
- Attach `watchPage()` and call `finishPageIssues()`; console warnings are annotations,
  console errors and `pageerror` fail the test.
- Measure the journey with `timed()`; a step over its budget logs a warning and an
  annotation instead of failing. Use the annotation to decide what to optimize.
- Every test must start from its own URL/temp profile and be safe to rerun.
- Web tests use the offline `computed` source and never require cbm.
