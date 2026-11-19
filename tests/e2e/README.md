# End-to-end tests

The same user journey is checked through the three shells that share `App.svelte`:

| Journey step | Web (`tests/web`) | VS Code webview (`tests/vscode`) | Fresh (`tests/fresh`) |
| --- | --- | --- | --- |
| Open a project/graph | context chip + graph root | command palette + webview | `Code Graph: Open (cbm)` |
| Open setup | Setup panel | Setup panel | `[E] Entry` picker |
| Search | search field + Enter | search field + Enter | terminal node click (no search field) |
| Inspect | node → details | node → details | node click → status line |
| Jump | Jump → bridge receipt | Jump → editor tab | node + `o` → file tab |

Rules for new tests:

- Prefer role/name/label selectors (`getByRole`, `getByLabel`, `getByText`), not CSS classes.
- Attach `watchPage()` and call `finishPageIssues()`; console warnings are annotations,
  console errors and `pageerror` fail the test.
- Measure the journey with `timed()`; a step over its budget logs a warning and an
  annotation instead of failing. Use the annotation to decide what to optimize.
- Every test must start from its own URL/temp profile and be safe to rerun.
- Web tests use the offline `computed` source and never require cbm.
