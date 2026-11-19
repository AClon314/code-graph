# Fresh e2e

[`@microsoft/tui-test`](https://github.com/microsoft/tui-test) drives a real
`fresh` process in a PTY and asserts text with terminal-native locators.

```bash
bun run test:fresh
```

The tests build `out/fresh-plugin/code-graph.js`, install it into an isolated
`XDG_CONFIG_HOME`, create a temporary workspace, and generate the deterministic
frame from `tui/fixture-graph.json`. They never touch your real Fresh profile or
a cbm daemon.
