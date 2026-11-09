import { describe, expect, test } from "bun:test";

import { parseIndexArgs } from "../scripts/index.ts";

function options(argv: string[]) {
  const parsed = parseIndexArgs(argv);
  if (parsed === "help") throw new Error("expected options, got help");
  return parsed;
}

describe("index CLI", () => {
  test("defaults to a cbm project named after the workspace", () => {
    const parsed = options([]);
    expect(parsed.backend).toBe("cbm");
    expect(parsed.mode).toBe("moderate");
    expect(parsed.project).toBe("graph-ui-svelte");
    expect(parsed.scipProject).toBe("graph-ui-svelte-scip");
  });

  test("keeps cbm and scip project names separate", () => {
    const parsed = options([
      "--backend",
      "both",
      "--project",
      "demo",
      "--scip-project",
      "demo-scip",
      "--mode",
      "fast",
    ]);
    expect(parsed.backend).toBe("both");
    expect(parsed.project).toBe("demo");
    expect(parsed.scipProject).toBe("demo-scip");
    expect(parsed.mode).toBe("fast");
  });

  test("rejects invalid backends and modes", () => {
    expect(() => parseIndexArgs(["--backend", "lsp"])).toThrow("--backend");
    expect(() => parseIndexArgs(["--mode", "turbo"])).toThrow("--mode");
  });

  test("--help does not require a valid workspace", () => {
    expect(parseIndexArgs(["--help"])).toBe("help");
  });
});
