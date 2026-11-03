import { describe, expect, test } from "bun:test";

import {
  PERSONAL_CONFIG_FILE,
  TEAM_CONFIG_FILE,
  backendConfig,
  loadProjectConfig,
  parseJsonc,
  projectConfigPaths,
} from "../src/lib/config";

const root = "/tmp/code-graph-workspace";

function files(values: Record<string, string>) {
  return (path: string) => {
    const name = path.split("/").at(-1)!;
    return values[name] ?? null;
  };
}

describe("project config JSONC", () => {
  test("accepts comments and trailing commas", () => {
    expect(
      parseJsonc(`{
        // team defaults
        "priority": 100,
        "backends": { "cbm": { "project": "gpen-js", }, },
        /* personal fallback */
      }`),
    ).toEqual({ priority: 100, backends: { cbm: { project: "gpen-js" } } });
  });

  test("uses the canonical two paths", () => {
    expect(projectConfigPaths(`${root}/`)).toEqual({
      team: `${root}/${TEAM_CONFIG_FILE}`,
      personal: `${root}/${PERSONAL_CONFIG_FILE}`,
    });
  });
});

describe("project config merge", () => {
  test("personal wins by default", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [TEAM_CONFIG_FILE]: `{ "priority": 100, "project": "team", "symbolEntry": "team.main" }`,
        [PERSONAL_CONFIG_FILE]: `{ "priority": 200, "symbolEntry": "personal.main" }`,
      }),
    );
    expect(loaded.config.project).toBe("team");
    expect(loaded.config.symbolEntry).toBe("personal.main");
    expect(loaded.sources.map((source) => source.found)).toEqual([true, true]);
  });

  test("team can win by raising priority", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [TEAM_CONFIG_FILE]: `{ "priority": 300, "project": "team", "symbolEntry": "team.main" }`,
        [PERSONAL_CONFIG_FILE]: `{ "priority": 200, "symbolEntry": "personal.main" }`,
      }),
    );
    expect(loaded.config.symbolEntry).toBe("team.main");
  });

  test("equal priorities keep canonical order, so personal wins", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [TEAM_CONFIG_FILE]: `{ "priority": 50, "project": "team" }`,
        [PERSONAL_CONFIG_FILE]: `{ "priority": 50, "project": "personal" }`,
      }),
    );
    expect(loaded.config.project).toBe("personal");
  });

  test("deep merge replaces arrays and null deletes keys", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [TEAM_CONFIG_FILE]: `{
          "priority": 100,
          "backends": { "cbm": { "project": "team", "symbolEntry": "team.main" } },
          "list": [1, 2]
        }`,
        [PERSONAL_CONFIG_FILE]: `{
          "priority": 200,
          "backends": { "cbm": { "symbolEntry": null } },
          "list": [3]
        }`,
      }),
    );
    expect(loaded.config.backends?.cbm).toEqual({
      project: "team",
      symbolEntry: undefined,
    });
    expect((loaded.config as Record<string, unknown>).list).toEqual([3]);
  });

  test("resolves backend-specific values before top-level fallbacks", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [TEAM_CONFIG_FILE]: `{
          "symbolEntry": "top.main",
          "backends": { "scip": { "project": "scip-project", "symbolEntry": "scip.main" } }
        }`,
      }),
    );
    expect(backendConfig(loaded.config, "cbm")).toMatchObject({
      project: "",
      symbolEntry: "top.main",
    });
    expect(backendConfig(loaded.config, "scip")).toMatchObject({
      project: "scip-project",
      symbolEntry: "scip.main",
    });
  });

  test("reports files that do not exist", async () => {
    const loaded = await loadProjectConfig(root, () => null);
    expect(loaded.config).toEqual({});
    expect(loaded.sources).toEqual([
      { path: `${root}/${TEAM_CONFIG_FILE}`, priority: 100, found: false },
      { path: `${root}/${PERSONAL_CONFIG_FILE}`, priority: 200, found: false },
    ]);
  });

  test("rejects a non-integer priority", async () => {
    await expect(
      loadProjectConfig(root, files({ [TEAM_CONFIG_FILE]: `{ "priority": 1.5 }` })),
    ).rejects.toThrow("priority must be an integer");
  });
});
