/**
 * Project-level configuration shared by the VS Code host, Fresh plugin, and
 * Bun-side scripts.
 *
 * Only two files are read:
 *   code-graph.config.jsonc       team defaults, normally committed
 *   .code-graph.config.jsonc      personal overrides, normally ignored
 *
 * Both are optional. They are merged at runtime by `priority` (larger wins);
 * the result is never written back. When neither exists, hosts create only the
 * team file.
 */

export type ConfigBackend = "cbm" | "scip";

export interface BackendConfig {
  project?: string;
  symbolEntry?: string;
}

export interface ProjectConfig {
  /** Higher wins. Defaults: team 100, personal 200. */
  priority?: number;
  backend?: ConfigBackend;
  /** Fallback project for both backends. */
  project?: string;
  /** Fallback graph root for both backends. */
  symbolEntry?: string;
  backends?: Partial<Record<ConfigBackend, BackendConfig>>;
}

export interface ConfigSource {
  path: string;
  priority: number;
  found: boolean;
}

export interface LoadedProjectConfig {
  config: ProjectConfig;
  sources: ConfigSource[];
}

export const TEAM_CONFIG_FILE = "code-graph.config.jsonc";
export const PERSONAL_CONFIG_FILE = ".code-graph.config.jsonc";
export const TEAM_DEFAULT_PRIORITY = 100;
export const PERSONAL_DEFAULT_PRIORITY = 200;

export const TEAM_CONFIG_TEMPLATE = `{
  "priority": ${TEAM_DEFAULT_PRIORITY}
}
`;

export class ProjectConfigError extends Error {
  readonly path: string;

  constructor(path: string, message: string, cause?: unknown) {
    super(`${path}: ${message}`, { cause });
    this.name = "ProjectConfigError";
    this.path = path;
  }
}

/** Return the two workspace config paths in canonical load order. */
export function projectConfigPaths(root: string): { team: string; personal: string } {
  const base = root.replace(/[/\\]+$/, "");
  return {
    team: `${base}/${TEAM_CONFIG_FILE}`,
    personal: `${base}/${PERSONAL_CONFIG_FILE}`,
  };
}

/** Load and merge both files. Missing files are reported in `sources`. */
export async function loadProjectConfig(
  root: string,
  readFile: (path: string) => string | null | Promise<string | null>,
): Promise<LoadedProjectConfig> {
  const paths = projectConfigPaths(root);
  const sources: ConfigSource[] = [];
  const configs: Array<{ config: ProjectConfig; order: number }> = [];

  for (const entry of [
    { path: paths.team, fallback: TEAM_DEFAULT_PRIORITY },
    { path: paths.personal, fallback: PERSONAL_DEFAULT_PRIORITY },
  ]) {
    let text: string | null;
    try {
      text = await readFile(entry.path);
    } catch (cause) {
      throw new ProjectConfigError(entry.path, "cannot read config", cause);
    }
    if (text === null) {
      sources.push({ path: entry.path, priority: entry.fallback, found: false });
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
    const config = parsed as ProjectConfig;
    const priority = readPriority(config.priority, entry.path, entry.fallback);
    sources.push({ path: entry.path, priority, found: true });
    configs.push({
      config: { ...config, priority },
      order: configs.length,
    });
  }

  // Only `priority` decides order. Equal priorities fall back to canonical
  // order (team first, personal last), so personal wins on a tie. The explicit
  // index keeps that guarantee even if a JS engine's sort is not stable.
  configs.sort(
    (left, right) =>
      (left.config.priority ?? 0) - (right.config.priority ?? 0) ||
      left.order - right.order,
  );
  let merged: ProjectConfig = {};
  for (const entry of configs) merged = mergeValue(merged, entry.config) as ProjectConfig;
  return { config: merged, sources };
}

/** Read/merge both files, creating only the team template when neither exists. */
export async function loadOrCreateProjectConfig(
  root: string,
  io: {
    readFile: (path: string) => string | null | Promise<string | null>;
    writeFile: (
      path: string,
      content: string,
    ) => void | boolean | Promise<void | boolean>;
  },
): Promise<LoadedProjectConfig> {
  const loaded = await loadProjectConfig(root, io.readFile);
  if (loaded.sources.some((source) => source.found)) return loaded;

  try {
    await io.writeFile(projectConfigPaths(root).team, TEAM_CONFIG_TEMPLATE);
  } catch {
    // Read-only or trusted-mode restrictions: use defaults rather than
    // failing the whole graph panel.
    return loaded;
  }
  return loadProjectConfig(root, io.readFile);
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

function readPriority(value: unknown, path: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ProjectConfigError(path, "priority must be an integer");
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
