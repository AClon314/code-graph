import { expect, test } from "bun:test";

import { rootsCachePath } from "../src/lib/graph/cache";
import { loadRoots } from "../tui/roots-source.ts";

test("Fresh roots source prefers roots.json and avoids spawning", async () => {
  const root = "/workspace";
  const candidate = {
    qualifiedName: "p.src.App",
    name: "App",
    label: "Module",
    filePath: "src/App.svelte",
    startLine: 1,
    reason: "module",
    kind: "module" as const,
  };
  let spawned = false;
  const roots = await loadRoots(
    {
      readFile: (path) => {
        expect(path).toBe(rootsCachePath(root));
        return JSON.stringify({
          version: 1,
          generatedAt: "",
          projects: { p: { roots: [candidate] } },
        });
      },
      spawn: async () => {
        spawned = true;
        return null;
      },
      setStatus: () => {},
    },
    { script: "", root, project: "p", backend: "cbm" },
  );

  expect(roots).toEqual([candidate]);
  expect(spawned).toBe(false);
});
