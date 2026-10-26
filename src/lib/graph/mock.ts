import type { GraphSource, SymbolBundle } from "./types";

const SYMBOLS: Record<string, SymbolBundle> = {
  "demo.src.features.useAlias": {
    node: {
      id: 1,
      label: "Function",
      name: "useAlias",
      qualifiedName: "demo.src.features.useAlias",
      filePath: "src/features.ts",
      startLine: 5,
      endLine: 7,
      docstring: "Alias/barrel import path; the hard case for heuristic call graphs.",
    },
    callers: [
      {
        id: 2,
        type: "CALLS",
        label: "Function",
        name: "main",
        qualifiedName: "demo.src.main.main",
        filePath: "src/main.ts",
        startLine: 3,
      },
    ],
    callees: [
      {
        id: 3,
        type: "CALLS",
        label: "Method",
        name: "get",
        qualifiedName: "demo.src.lib.base.BaseRepo.get",
        filePath: "src/lib/base.ts",
        startLine: 4,
      },
      {
        id: 4,
        type: "CALLS",
        label: "Class",
        name: "UserRepo",
        qualifiedName: "demo.src.lib.user-repo.UserRepo",
        filePath: "src/lib/user-repo.ts",
        startLine: 2,
      },
    ],
  },
  "demo.src.main.main": {
    node: {
      id: 2,
      label: "Function",
      name: "main",
      qualifiedName: "demo.src.main.main",
      filePath: "src/main.ts",
      startLine: 3,
      endLine: 8,
      isEntry: true,
    },
    callers: [],
    callees: [
      {
        id: 1,
        type: "CALLS",
        label: "Function",
        name: "useAlias",
        qualifiedName: "demo.src.features.useAlias",
        filePath: "src/features.ts",
        startLine: 5,
      },
    ],
  },
  "demo.src.lib.base.BaseRepo.get": {
    node: {
      id: 3,
      label: "Method",
      name: "get",
      qualifiedName: "demo.src.lib.base.BaseRepo.get",
      filePath: "src/lib/base.ts",
      startLine: 4,
      endLine: 7,
    },
    callers: [
      {
        id: 1,
        type: "CALLS",
        label: "Function",
        name: "useAlias",
        qualifiedName: "demo.src.features.useAlias",
        filePath: "src/features.ts",
        startLine: 5,
      },
    ],
    callees: [],
  },
  "demo.src.lib.user-repo.UserRepo": {
    node: {
      id: 4,
      label: "Class",
      name: "UserRepo",
      qualifiedName: "demo.src.lib.user-repo.UserRepo",
      filePath: "src/lib/user-repo.ts",
      startLine: 2,
      endLine: 8,
    },
    callers: [
      {
        id: 1,
        type: "CALLS",
        label: "Function",
        name: "useAlias",
        qualifiedName: "demo.src.features.useAlias",
        filePath: "src/features.ts",
        startLine: 5,
      },
    ],
    callees: [
      {
        id: 3,
        type: "CALLS",
        label: "Method",
        name: "get",
        qualifiedName: "demo.src.lib.base.BaseRepo.get",
        filePath: "src/lib/base.ts",
        startLine: 4,
      },
    ],
  },
};

/** Deterministic source used by `bun run dev` before a daemon is running. */
export class MockSource implements GraphSource {
  async symbol(_project: string, ref: string): Promise<SymbolBundle> {
    const found = SYMBOLS[ref];
    if (!found) throw new Error(`mock symbol not found: ${ref}`);
    return structuredClone(found);
  }
}
