import type {
  GraphSource,
  ImpactResult,
  Project,
  SearchHit,
  SourceSlice,
  SymbolBundle,
  TraceResult,
  TreeEntry,
} from "./types";

const PROJECT: Project = { name: "demo", rootPath: "/demo", indexedAt: "2026-10-20T00:00:00Z" };

const TREE: Record<string, TreeEntry[]> = {
  "": [
    { name: "src", path: "src", kind: "dir", symbols: 6, files: 2 },
    { name: "README.md", path: "README.md", kind: "file", symbols: 1 },
  ],
  src: [
    { name: "features.ts", path: "src/features.ts", kind: "file", symbols: 4 },
    { name: "Comp.svelte", path: "src/Comp.svelte", kind: "file", symbols: 2 },
  ],
};

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
};

const SOURCE = [
  "import { UserRepo } from './lib/barrel';",
  "import type { User } from './lib/types';",
  "",
  "export function useAlias(): User {",
  "  const repo = new UserRepo();",
  "  return repo.get('id');",
  "}",
].join("\n");

/** Deterministic source used by `bun run dev` before a daemon is running. */
export class MockSource implements GraphSource {
  async projects(): Promise<Project[]> {
    return [PROJECT];
  }

  async tree(_project: string, path = ""): Promise<TreeEntry[]> {
    return TREE[path] ?? [];
  }

  async symbol(_project: string, ref: string): Promise<SymbolBundle> {
    const found = SYMBOLS[ref];
    if (!found) throw new Error(`mock symbol not found: ${ref}`);
    return structuredClone(found);
  }

  async trace(_project: string, from: string, to: string, mode = "calls"): Promise<TraceResult> {
    return {
      from,
      to,
      mode,
      path: [
        { name: "useAlias", qualifiedName: "demo.src.features.useAlias", filePath: "src/features.ts" },
        { name: "get", qualifiedName: "demo.src.lib.base.BaseRepo.get", filePath: "src/lib/base.ts" },
      ],
    };
  }

  async impact(_project: string, node: string): Promise<ImpactResult> {
    return {
      root: node,
      nodes: [
        { name: "useAlias", qualifiedName: "demo.src.features.useAlias", filePath: "src/features.ts", hop: 0 },
        { name: "main", qualifiedName: "demo.src.main.main", filePath: "src/main.ts", hop: 1 },
      ],
      edges: [{ source: "demo.src.main.main", target: "demo.src.features.useAlias", type: "CALLS" }],
    };
  }

  async source(_project: string, path: string, start = 1, end = 200): Promise<SourceSlice> {
    const lines = SOURCE.split("\n");
    const first = Math.max(1, start);
    const last = Math.min(lines.length, end);
    return {
      path,
      source: lines.slice(first - 1, last).join("\n"),
      firstLine: first,
      lastLine: last,
      truncated: last < lines.length,
    };
  }

  async search(_project: string, query: string, limit = 20): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    return Object.values(SYMBOLS)
      .map((bundle) => bundle.node)
      .filter((node) => node.name.toLowerCase().includes(q) || node.qualifiedName.toLowerCase().includes(q))
      .slice(0, limit)
      .map((node) => ({
        label: node.label,
        name: node.name,
        qualifiedName: node.qualifiedName,
        filePath: node.filePath,
        startLine: node.startLine,
      }));
  }
}
