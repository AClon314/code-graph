import { describe, expect, test } from "bun:test";

import {
  CSS_CONFIG_FILE,
  CSS_CONFIG_TEMPLATE,
  PERSONAL_CONFIG_FILE,
  PERSONAL_CSS_CONFIG_FILE,
  PERSONAL_RENDERER_FILE,
  TEAM_CONFIG_FILE,
  backendConfig,
  configPaths,
  globalConfigRoot,
  loadOrCreateProjectConfig,
  loadProjectConfig,
  nodeRendererPath,
  parseJsonc,
  projectConfigPaths,
  resolveNodeRendererPath,
} from "../src/lib/config";

const root = "/tmp/code-graph-workspace";
const globalRoot = "/tmp/code-graph-global";

function files(values: Record<string, string>) {
  return (path: string) => values[path] ?? null;
}

describe("config JSONC", () => {
  test("accepts comments and trailing commas", () => {
    expect(
      parseJsonc(`{
        // team defaults
        "backends": { "cbm": { "project": "gpen-js", }, },
        /* personal fallback */
      }`),
    ).toEqual({ backends: { cbm: { project: "gpen-js" } } });
  });

  test("uses the canonical project and global paths", () => {
    expect(projectConfigPaths(`${root}/`)).toEqual({
      team: `${root}/${TEAM_CONFIG_FILE}`,
      personal: `${root}/${PERSONAL_CONFIG_FILE}`,
    });
    expect(configPaths(root, globalRoot)).toEqual({
      global: {
        jsonc: `${globalRoot}/${TEAM_CONFIG_FILE}`,
        css: `${globalRoot}/${CSS_CONFIG_FILE}`,
        renderer: `${globalRoot}/code-graph.config.mjs`,
      },
      project: {
        jsonc: `${root}/${TEAM_CONFIG_FILE}`,
        css: `${root}/${CSS_CONFIG_FILE}`,
        renderer: `${root}/code-graph.config.mjs`,
      },
      personal: {
        jsonc: `${root}/${PERSONAL_CONFIG_FILE}`,
        css: `${root}/${PERSONAL_CSS_CONFIG_FILE}`,
        renderer: `${root}/${PERSONAL_RENDERER_FILE}`,
      },
    });
  });

  test("resolves the global config directory from XDG and platform homes", () => {
    expect(globalConfigRoot({ XDG_CONFIG_HOME: "/xdg", HOME: "/home/me" }, "linux")).toBe(
      "/xdg/code-graph",
    );
    expect(globalConfigRoot({ HOME: "/home/me" }, "linux")).toBe(
      "/home/me/.config/code-graph",
    );
    expect(globalConfigRoot({ HOME: "/home/me" }, "darwin")).toBe(
      "/home/me/Library/Application Support/code-graph",
    );
    expect(
      globalConfigRoot({ APPDATA: "C:/Users/me/AppData/Roaming" }, "win32"),
    ).toBe("C:/Users/me/AppData/Roaming/code-graph");
  });

  test("resolves the configured node renderer and falls back to the default", () => {
    expect(nodeRendererPath(root, { node: { renderer: "ui/render.mjs" } })).toBe(
      `${root}/ui/render.mjs`,
    );
    expect(nodeRendererPath(root, {})).toBe(`${root}/code-graph.config.mjs`);
  });
});

describe("config layering", () => {
  test("global < project < hidden project", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [`${globalRoot}/${TEAM_CONFIG_FILE}`]: `{ "project": "global", "symbolEntry": "global.main" }`,
        [`${root}/${TEAM_CONFIG_FILE}`]: `{ "project": "team", "symbolEntry": "team.main" }`,
        [`${root}/${PERSONAL_CONFIG_FILE}`]: `{ "symbolEntry": "personal.main" }`,
      }),
      globalRoot,
    );
    expect(loaded.config.project).toBe("team");
    expect(loaded.config.symbolEntry).toBe("personal.main");
    expect(loaded.sources.map((source) => source.layer)).toEqual([
      "global",
      "project",
      "personal",
    ]);
  });

  test("deep merge replaces arrays and null deletes keys", async () => {
    const loaded = await loadProjectConfig(
      root,
      files({
        [`${root}/${TEAM_CONFIG_FILE}`]: `{
          "backends": { "cbm": { "project": "team", "symbolEntry": "team.main" } },
          "list": [1, 2]
        }`,
        [`${root}/${PERSONAL_CONFIG_FILE}`]: `{
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
        [`${root}/${TEAM_CONFIG_FILE}`]: `{
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

  test("reports missing layers", async () => {
    const loaded = await loadProjectConfig(root, () => null, globalRoot);
    expect(loaded.config).toEqual({});
    expect(loaded.sources).toEqual([
      { path: `${globalRoot}/${TEAM_CONFIG_FILE}`, layer: "global", found: false },
      { path: `${root}/${TEAM_CONFIG_FILE}`, layer: "project", found: false },
      { path: `${root}/${PERSONAL_CONFIG_FILE}`, layer: "personal", found: false },
    ]);
  });

  test("uses the nearest existing renderer by layer", async () => {
    const layers = (personal = {}, project = {}, global = {}): any => ({
      config: {},
      sources: [],
      layers: [
        { layer: "global", config: global },
        { layer: "project", config: project },
        { layer: "personal", config: personal },
      ],
    });
    await expect(
      resolveNodeRendererPath(
        root,
        layers(),
        files({
          [`${globalRoot}/code-graph.config.mjs`]: "global",
          [`${root}/code-graph.config.mjs`]: "project",
          [`${root}/${PERSONAL_RENDERER_FILE}`]: "personal",
        }),
        globalRoot,
      ),
    ).resolves.toBe(`${root}/${PERSONAL_RENDERER_FILE}`);
    await expect(
      resolveNodeRendererPath(
        root,
        layers(),
        files({ [`${globalRoot}/code-graph.config.mjs`]: "global" }),
        globalRoot,
      ),
    ).resolves.toBe(`${globalRoot}/code-graph.config.mjs`);
  });

  test("a project default renderer beats a global explicit renderer", async () => {
    const loaded = {
      config: {},
      sources: [],
      layers: [
        { layer: "global" as const, config: { node: { renderer: "custom.mjs" } } },
        { layer: "project" as const, config: {} },
        { layer: "personal" as const, config: {} },
      ],
    };
    await expect(
      resolveNodeRendererPath(
        root,
        loaded,
        files({
          [`${globalRoot}/custom.mjs`]: "global",
          [`${root}/code-graph.config.mjs`]: "project",
        }),
        globalRoot,
      ),
    ).resolves.toBe(`${root}/code-graph.config.mjs`);
  });
});

describe("project config creation", () => {
  test("creates the project config, CSS and renderer when nothing exists", async () => {
    const written: Record<string, string> = {};
    const io = {
      readFile: (path: string) => written[path] ?? null,
      writeFile: (path: string, content: string) => {
        written[path] = content;
      },
    };

    const loaded = await loadOrCreateProjectConfig(root, io, globalRoot);
    expect(Object.keys(written)).toEqual([
      `${root}/${TEAM_CONFIG_FILE}`,
      `${root}/${CSS_CONFIG_FILE}`,
      `${root}/code-graph.config.mjs`,
    ]);
    expect(written[`${root}/${CSS_CONFIG_FILE}`]).toBe(CSS_CONFIG_TEMPLATE);
    expect(written[`${root}/code-graph.config.mjs`]).toContain("renderNodeHtml");
    expect(loaded.sources).toEqual([
      { path: `${globalRoot}/${TEAM_CONFIG_FILE}`, layer: "global", found: false },
      { path: `${root}/${TEAM_CONFIG_FILE}`, layer: "project", found: true },
      { path: `${root}/${PERSONAL_CONFIG_FILE}`, layer: "personal", found: false },
    ]);
  });

  test("adds a missing renderer without rewriting existing config", async () => {
    const written: string[] = [];
    const loaded = await loadOrCreateProjectConfig(
      root,
      {
        readFile: (path) =>
          path.endsWith(PERSONAL_CONFIG_FILE) ? `{ "project": "personal" }` : null,
        writeFile: (path: string) => {
          written.push(path);
        },
      },
      globalRoot,
    );

    expect(written).toEqual([`${root}/code-graph.config.mjs`]);
    expect(loaded.config.project).toBe("personal");
  });

  test("uses defaults when the project config cannot be created", async () => {
    const loaded = await loadOrCreateProjectConfig(
      root,
      {
        readFile: () => null,
        writeFile: () => {
          throw new Error("read-only workspace");
        },
      },
      globalRoot,
    );
    expect(loaded.config).toEqual({});
  });
});
