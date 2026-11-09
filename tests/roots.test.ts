import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseRootsCache,
  rootCandidates,
  rootsForProject,
} from "../src/lib/graph/roots";
import { readRootsCache, writeRootsCache } from "../src/cli/lib/roots-cache";
import { rootsCachePath } from "../src/lib/graph/cache";

test("root candidates prefer main, modules, then entry functions", () => {
  const roots = rootCandidates(
    [
      {
        name: "load",
        label: "Function",
        qualified_name: "p.src.App.load",
        file_path: "src/App.svelte",
        is_exported: true,
      },
      {
        name: "App",
        label: "Module",
        qualified_name: "p.src.App",
        file_path: "src/App.svelte",
      },
      {
        name: "README",
        label: "Module",
        qualified_name: "p.README",
        file_path: "README.md",
      },
      {
        name: "main",
        label: "Function",
        qualified_name: "p.tui.main",
        file_path: "tui/main.ts",
        is_entry: true,
      },
      {
        name: "GraphCommand",
        label: "Class",
        qualified_name: "p.src.GraphCommand",
        file_path: "src/GraphCommand.ts",
        is_exported: true,
      },
    ],
    10,
  );

  expect(roots.map((root) => root.qualifiedName)).toEqual([
    "p.tui.main",
    "p.src.App",
    "p.src.GraphCommand",
    "p.src.App.load",
  ]);
  expect(roots.find((root) => root.qualifiedName === "p.src.App")?.reason).toBe(
    "module",
  );
  expect(roots.some((root) => root.qualifiedName === "p.README")).toBe(false);
});

test("roots cache merges projects and ignores corrupt files", () => {
  const root = mkdtempSync(join(tmpdir(), "code-graph-roots-"));
  const candidate = {
    qualifiedName: "p.src.App",
    name: "App",
    label: "Module",
    filePath: "src/App.svelte",
    startLine: 1,
    reason: "module",
    kind: "module" as const,
  };

  const path = writeRootsCache(root, "p", [candidate]);
  expect(path).toBe(rootsCachePath(root));
  expect(
    rootsForProject(JSON.stringify(readRootsCache(root)), "p"),
  ).toEqual([candidate]);

  writeRootsCache(root, "q", []);
  expect(Object.keys(readRootsCache(root).projects).sort()).toEqual(["p", "q"]);
  expect(parseRootsCache("{not json")).toBeNull();
  expect(rootsForProject("{not json", "p")).toEqual([]);
});
