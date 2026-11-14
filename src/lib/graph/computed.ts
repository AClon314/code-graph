import type { RootCandidate } from "./roots";
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

interface ComputedPath {
  path: string;
  root: string;
  kind: RootCandidate["kind"];
  reason: string;
}

/**
 * File and folder entry points for the offline sample. `value` is the path
 * inserted into the root field; the graph still loads the symbol behind it.
 */
const PATHS: readonly ComputedPath[] = [
  { path: "src", root: "demo.src.main.main", kind: "module", reason: "folder" },
  { path: "src/main.ts", root: "demo.src.main.main", kind: "entry", reason: "file, main" },
  {
    path: "src/features.ts",
    root: "demo.src.features.useAlias",
    kind: "entry",
    reason: "file, exported",
  },
  { path: "src/lib", root: "demo.src.lib.user-repo.UserRepo", kind: "module", reason: "folder" },
  {
    path: "src/lib/base.ts",
    root: "demo.src.lib.base.BaseRepo.get",
    kind: "class",
    reason: "file, method",
  },
  {
    path: "src/lib/user-repo.ts",
    root: "demo.src.lib.user-repo.UserRepo",
    kind: "class",
    reason: "file, class",
  },
];

function normalize(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/^\.\//, "");
}

function stripPosition(value: string): string {
  return value.replace(/:\d+(?::\d+)?$/, "");
}

/** Resolve a qualified name, file path, folder path or absolute path. */
export function resolveComputedRef(ref: string): string | null {
  const text = ref.trim();
  if (SYMBOLS[text]) return text;

  const path = normalize(stripPosition(text));
  if (!path) return null;
  const direct = PATHS.find((entry) => entry.path === path);
  if (direct) return direct.root;

  // A pasted absolute path should still work: match the longest known suffix.
  const suffix = [...PATHS]
    .sort((left, right) => right.path.length - left.path.length)
    .find((entry) => path.endsWith(`/${entry.path}`));
  return suffix?.root ?? null;
}

/** Display a known symbol as its shortest file/folder path. */
export function computedDisplayRef(ref: string): string {
  const root = resolveComputedRef(ref);
  const matches = PATHS.filter((entry) => entry.root === root);
  return (matches.find((entry) => entry.kind !== "module") ?? matches[0])?.path ?? ref;
}

/** File/folder roots shown by the computed-mode picker. */
export function computedRootCandidates(): RootCandidate[] {
  return PATHS.map((entry) => {
    const bundle = SYMBOLS[entry.root];
    return {
      qualifiedName: entry.root,
      value: entry.path,
      display: entry.path === "src" || entry.path === "src/lib" ? `${entry.path}/` : entry.path,
      name: entry.path,
      label: bundle.node.label,
      filePath: bundle.node.filePath ?? entry.path,
      startLine: bundle.node.startLine ?? 0,
      reason: entry.reason,
      kind: entry.kind,
    };
  });
}

/** Deterministic offline source used by `bun run web` without a daemon. */
export class ComputedSource implements GraphSource {
  async symbol(_project: string, ref: string): Promise<SymbolBundle> {
    const key = resolveComputedRef(ref);
    if (!key) throw new Error(`computed path or symbol not found: ${ref}`);
    return structuredClone(SYMBOLS[key]);
  }
}
