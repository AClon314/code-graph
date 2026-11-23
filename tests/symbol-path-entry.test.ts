import { describe, expect, test } from "bun:test";

import { createGraphUiState } from "../src/lib/state/code-graph";
import {
  applyEntryPath,
  folderEntryPath,
  resolveEntryPath,
} from "../src/lib/state/symbol-path-entry";
import { projectForRoot } from "../src/lib/graph/loaders";

function state() {
  const value = createGraphUiState({
    source: "cbm",
    project: "repo",
    workspaceRoot: "/C:/repo",
  });
  value.setup.projectRows = [{ name: "repo", rootPath: "C:/repo", branch: "main" }];
  return value;
}

describe("symbol path entry", () => {
  test("keeps legacy numeric symbol ids", () => {
    expect(resolveEntryPath(state(), "#42")).toEqual({ qualifiedName: "#42" });
    expect(resolveEntryPath(state(), "demo.src.main.main")).toEqual({
      qualifiedName: "demo.src.main.main",
    });
  });

  test("matches Windows roots after Unix normalization", () => {
    const value = state();
    expect(folderEntryPath(value, "/C:/repo//")).toBe("/C:/repo");
    expect(resolveEntryPath(value, "/C:/repo//")).toEqual({
      qualifiedName: "",
      project: "repo",
      rootPath: "C:/repo",
    });
    expect(applyEntryPath(value, "/C:/repo//")).toBeNull();
    expect(value.setup.project).toBe("repo");
    expect(value.setup.path).toBe("repo//");
  });

  test("selects a unique project by root and rejects ambiguous roots", () => {
    const rows = [
      { name: "a", rootPath: "C:/repo", branch: "main" },
      { name: "b", rootPath: "/D:/other", branch: "main" },
    ];
    expect(projectForRoot(rows, "/C:/repo")?.name).toBe("a");
    expect(
      projectForRoot(
        [...rows, { name: "c", rootPath: "/C:/repo", branch: "main" }],
        "/C:/repo",
      ),
    ).toBeNull();
  });
});
