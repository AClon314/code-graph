/**
 * Layered configuration shared by the VS Code host, Fresh plugin, web host and
 * Bun-side scripts.
 *
 * Layer order (lowest to highest):
 *   global config dir        `$XDG_CONFIG_HOME/code-graph/` (Linux default)
 *   project config           `<workspace>/code-graph.config.*`
 *   project hidden config    `<workspace>/.code-graph.config.*`
 *
 * JSONC files are deep-merged at runtime; CSS layers are loaded as separate
 * stylesheet links in the same order (browser cascade); the node renderer uses
 * the highest layer that supplies an existing module. The result is never
 * written back. When no JSONC exists, the project config, CSS and default
 * renderer are created.
 */

import { DEFAULT_NODE_RENDERER, NODE_RENDERER_FILE } from "./node-renderer";

export type ConfigBackend = "cbm" | "scip";
export type ConfigLayer = "global" | "project" | "personal";

export interface BackendConfig {
  project?: string;
  symbolEntry?: string;
}

export interface NodeConfig {
  /** Workspace-relative renderer; default `code-graph.config.mjs`. */
  renderer?: string;
}

export interface ProjectConfig {
  /** Optional node renderer module. */
  node?: NodeConfig;
  /** Fallback project for both backends. */
  project?: string;
  /** Fallback graph root for both backends. */
  symbolEntry?: string;
  backends?: Partial<Record<ConfigBackend, BackendConfig>>;
}

export interface ConfigSource {
  path: string;
  layer: ConfigLayer;
  found: boolean;
}

export interface LoadedProjectConfig {
  config: ProjectConfig;
  sources: ConfigSource[];
  /** Per-layer configs, including empty missing layers (for renderer lookup). */
  layers: Array<{ layer: ConfigLayer; config: ProjectConfig }>;
}

export interface ConfigPathSet {
  jsonc: string;
  css: string;
  renderer: string;
}

export interface ConfigPaths {
  global: ConfigPathSet | null;
  project: ConfigPathSet;
  personal: ConfigPathSet;
}

export const CONFIG_BASENAME = "code-graph.config";
export const TEAM_CONFIG_FILE = `${CONFIG_BASENAME}.jsonc`;
export const PERSONAL_CONFIG_FILE = `.${CONFIG_BASENAME}.jsonc`;
export const CSS_CONFIG_FILE = `${CONFIG_BASENAME}.css`;
export const PERSONAL_CSS_CONFIG_FILE = `.${CONFIG_BASENAME}.css`;
export const PERSONAL_RENDERER_FILE = `.${CONFIG_BASENAME}.mjs`;
export const GLOBAL_CONFIG_DIR_NAME = "code-graph";

export const TEAM_CONFIG_TEMPLATE = `{
  // Optional: customize node rendering with a shared renderer module.
  "node": { "renderer": "code-graph.config.mjs" },
  "backends": {
    // "cbm": { "project": "my-cbm-project" },
    // "scip": { "project": "my-scip-project" }
  }
}
`;

export const CSS_CONFIG_TEMPLATE = `/*
 * Code Graph style overrides. Set one scale for the whole shell:
 *
 * :root {
 *   --code-graph-ui-scale: 0.95;
 * }
 */
`;

export class ProjectConfigError extends Error {
  readonly path: string;

  constructor(path: string, message: string, cause?: unknown) {
    super(`${path}: ${message}`, { cause });
    this.name = "ProjectConfigError";
    this.path = path;
  }
}

function joinPath(root: string, name: string): string {
  const base = root.replace(/[/\\]+$/, "");
  return `${base}/${name}`;
}

function pathSet(root: string): ConfigPathSet {
  return {
    jsonc: joinPath(root, TEAM_CONFIG_FILE),
    css: joinPath(root, CSS_CONFIG_FILE),
    renderer: joinPath(root, NODE_RENDERER_FILE),
  };
}

function personalPathSet(root: string): ConfigPathSet {
  return {
    jsonc: joinPath(root, PERSONAL_CONFIG_FILE),
    css: joinPath(root, PERSONAL_CSS_CONFIG_FILE),
    renderer: joinPath(root, PERSONAL_RENDERER_FILE),
  };
}

/** Global config directory, without touching `node:os` in the browser bundle. */
export function globalConfigRoot(
  env: Record<string, string | undefined>,
  platform = "linux",
): string {
  const home = env.HOME || env.USERPROFILE || "";
  let base: string;
  if (platform === "darwin") {
    base = joinPath(home, "Library/Application Support");
  } else if (platform === "win32") {
    base = env.APPDATA || joinPath(home, "AppData/Roaming");
  } else {
    base = env.XDG_CONFIG_HOME || joinPath(home, ".config");
  }
  return joinPath(base, GLOBAL_CONFIG_DIR_NAME);
}

/** Canonical paths for all three config layers. */
export function configPaths(root: string, globalRoot?: string): ConfigPaths {
  return {
    global: globalRoot ? pathSet(globalRoot) : null,
    project: pathSet(root),
    personal: personalPathSet(root),
  };
}

/** Project-only paths, kept for callers that only need the workspace pair. */
export function projectConfigPaths(root: string): { team: string; personal: string } {
  const paths = configPaths(root);
  return { team: paths.project.jsonc, personal: paths.personal.jsonc };
}

/** Absolute path of the configured node renderer (default project file). */
export function nodeRendererPath(root: string, config: ProjectConfig): string {
  const relative = config.node?.renderer?.trim() || NODE_RENDERER_FILE;
  return relative.startsWith("/") ? relative : joinPath(root, relative);
}

/** Pick the highest layer that supplies an existing renderer module. */
export async function resolveNodeRendererPath(
  root: string,
  loaded: LoadedProjectConfig,
  readFile: (path: string) => string | null | Promise<string | null>,
  globalRoot?: string,
): Promise<string> {
  const paths = configPaths(root, globalRoot);
  const byLayer = new Map(loaded.layers.map((entry) => [entry.layer, entry.config]));
  const candidates = [
    {
      base: root,
      config: byLayer.get("personal") ?? {},
      fallback: paths.personal.renderer,
    },
    {
      base: root,
      config: byLayer.get("project") ?? {},
      fallback: paths.project.renderer,
    },
    {
      base: globalRoot ?? root,
      config: byLayer.get("global") ?? {},
      fallback: paths.global?.renderer,
    },
  ];

  for (const entry of candidates) {
    const explicit = entry.config.node?.renderer?.trim();
    const path = explicit
      ? explicit.startsWith("/")
        ? explicit
        : joinPath(entry.base, explicit)
      : entry.fallback;
    if (!path) continue;
    try {
      const text = await readFile(path);
      if (text !== null && text.trim() !== "") return path;
    } catch {
      // An unreadable candidate behaves like a missing one.
    }
  }
  return paths.project.renderer;
}

/** Load and merge all JSONC layers. Missing files are reported in `sources`. */
export async function loadProjectConfig(
  root: string,
  readFile: (path: string) => string | null | Promise<string | null>,
  globalRoot?: string,
): Promise<LoadedProjectConfig> {
  const paths = configPaths(root, globalRoot);
  const layers: Array<{ path: string; layer: ConfigLayer }> = [
    ...(paths.global ? [{ path: paths.global.jsonc, layer: "global" as const }] : []),
    { path: paths.project.jsonc, layer: "project" },
    { path: paths.personal.jsonc, layer: "personal" },
  ];
  const sources: ConfigSource[] = [];
  const perLayer: Array<{ layer: ConfigLayer; config: ProjectConfig }> = [];
  let merged: ProjectConfig = {};

  for (const entry of layers) {
    let text: string | null;
    try {
      text = await readFile(entry.path);
    } catch (cause) {
      throw new ProjectConfigError(entry.path, "cannot read config", cause);
    }
    if (text === null || text.trim() === "") {
      sources.push({ path: entry.path, layer: entry.layer, found: false });
      perLayer.push({ layer: entry.layer, config: {} });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parseJsonc(text);
    } catch (cause) {
      throw new ProjectConfigError(entry.path, "invalid JSONC", cause);
    }
    if (!isRecord(parsed)) {
      throw new ProjectConfigError(entry.path, "top-level value must be an object");
    }
    sources.push({ path: entry.path, layer: entry.layer, found: true });
    perLayer.push({ layer: entry.layer, config: parsed as ProjectConfig });
    merged = mergeValue(merged, parsed) as ProjectConfig;
  }
  return { config: merged, sources, layers: perLayer };
}

/** Read/merge all layers, creating project defaults only when no JSONC exists. */
export async function loadOrCreateProjectConfig(
  root: string,
  io: {
    readFile: (path: string) => string | null | Promise<string | null>;
    writeFile: (
      path: string,
      content: string,
    ) => void | boolean | Promise<void | boolean>;
  },
  globalRoot?: string,
): Promise<LoadedProjectConfig> {
  const loaded = await loadProjectConfig(root, io.readFile, globalRoot);
  if (loaded.sources.some((source) => source.found)) {
    await ensureNodeRenderer(root, loaded, io, globalRoot);
    return loaded;
  }

  try {
    const paths = configPaths(root, globalRoot);
    await io.writeFile(paths.project.jsonc, TEAM_CONFIG_TEMPLATE);
    await io.writeFile(paths.project.css, CSS_CONFIG_TEMPLATE);
  } catch {
    // Read-only or trusted-mode restrictions: use defaults rather than
    // failing the whole graph panel.
    return loaded;
  }
  await ensureNodeRenderer(root, loaded, io, globalRoot);
  return loadProjectConfig(root, io.readFile, globalRoot);
}

async function ensureNodeRenderer(
  root: string,
  loaded: LoadedProjectConfig,
  io: {
    readFile: (path: string) => string | null | Promise<string | null>;
    writeFile: (path: string, content: string) => void | boolean | Promise<void | boolean>;
  },
  globalRoot?: string,
): Promise<void> {
  try {
    const path = await resolveNodeRendererPath(root, loaded, io.readFile, globalRoot);
    const existing = await io.readFile(path);
    if (!existing || !existing.trim()) await io.writeFile(path, DEFAULT_NODE_RENDERER);
  } catch {
    // Read-only workspaces keep the built-in SVG text fallback.
  }
}

/** Resolve project and graph root for one backend. */
export function backendConfig(
  config: ProjectConfig,
  backend: ConfigBackend,
): Required<Pick<BackendConfig, "project" | "symbolEntry">> & BackendConfig {
  const section = config.backends?.[backend] ?? {};
  return {
    ...section,
    project: section.project ?? config.project ?? "",
    symbolEntry: section.symbolEntry ?? config.symbolEntry ?? "",
  };
}

/** Deep merge with `null` deleting keys and arrays replacing wholesale. */
export function mergeConfigs(base: ProjectConfig, override: ProjectConfig): ProjectConfig {
  return mergeValue(base, override) as ProjectConfig;
}

function mergeValue(base: unknown, override: unknown): unknown {
  if (override === null) return undefined;
  if (Array.isArray(override)) return override.map(cloneValue);
  if (isRecord(override)) {
    const output: Record<string, unknown> = isRecord(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(override)) {
      if (value === null) {
        delete output[key];
        continue;
      }
      output[key] = mergeValue(output[key], value);
    }
    return output;
  }
  return override;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) output[key] = cloneValue(item);
    return output;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse JSONC without pulling a parser dependency into the webview/Fresh bundle. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripComments(text.replace(/^\uFEFF/, ""))));
}

function stripComments(text: string): string {
  let output = "";
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < text.length) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index++;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index++;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 2;
      while (index < text.length && text[index] !== "\n") index++;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        if (text[index] === "\n") output += "\n";
        index++;
      }
      index += 2;
      output += " ";
      continue;
    }
    output += char;
    index++;
  }
  return output;
}

function stripTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead]!)) lookahead++;
      if (text[lookahead] === "}" || text[lookahead] === "]") continue;
    }
    output += char;
  }
  return output;
}
