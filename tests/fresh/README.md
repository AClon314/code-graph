# Fresh e2e

Termwright drives a real `fresh` process in a PTY. It is intentionally separate
from `bun test`: the Bun unit-test runner would try to execute these files with
the wrong runtime.

```bash
bun run test:fresh
```

Termwright requires Node 22 or 24. `tests/fresh/run.ts` picks `NODE_BIN`, then
`node-22`, `/usr/bin/node`, or `node`; set `NODE_BIN` explicitly when needed.
The test creates an isolated `FRESH_CONFIG` and workspace, so it does not touch
your real Fresh profile.
