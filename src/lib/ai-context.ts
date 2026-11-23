/**
 * Build the Markdown/JSON context shown by the forAI panel and copied by the
 * toolbar. The canonical identity is a `GlobalSymbolPath`; callers/callees are
 * keyed by their compact global path so the payload stays readable and does
 * not duplicate the absolute workspace root.
 */
import type {
  GraphViewNode,
  SymbolBundle,
  SymbolConnection,
  SymbolNode,
} from "./graph/types";
import {
  GlobalSymbolPath,
  basenamePath,
  globalSymbolPathFor,
  type SymbolCandidate,
} from "./symbol-path";

export type CopyMode = "svg" | "absolute" | "relative" | "markdown" | "json";
export type SaveMode = "svg";
export type DetailMode = "raw" | "preview" | "json";

export interface AiLink {
  label: string;
  file: string;
  line: number;
  column: number;
  symbolPath: string;
  location: string;
}

export interface AiJson {
  self: string;
  location: string;
  callers: Record<string, AiLink>;
  callees: Record<string, AiLink>;
}

export interface AiContext {
  path: GlobalSymbolPath;
  markdown: string;
  json: AiJson;
}

type AiTarget = SymbolNode | GraphViewNode;

/** Build both representations from one bundle; null when there is no symbol. */
export function buildAiContext(
  bundle: SymbolBundle | null,
  focusNode: GraphViewNode | null,
  cwd: string,
  project = "",
): AiContext | null {
  const target = bundle?.node ?? focusNode;
  if (!target) return null;

  const path = globalSymbolPathFor(target, cwd, project);
  const callers = bundle?.callers ?? [];
  const callees = bundle?.callees ?? [];
  const markdown = markdownFor(path, target, callers, callees, project);
  const json = jsonFor(path, target, callers, callees, project);
  return { path, markdown, json };
}

function markdownFor(
  path: GlobalSymbolPath,
  target: AiTarget,
  callers: readonly SymbolConnection[],
  callees: readonly SymbolConnection[],
  project: string,
): string {
  const folder = path.project || basenamePath(path.folder) || "cwd";
  const lines: string[] = [`# ${markdownText(folder)}/`];
  if (path.file) {
    lines.push(`## ${markdownText(path.file)}`);
    if (path.symbol) lines.push(`### \\#${markdownText(path.symbol)}`);
    lines.push(path.toLocation(target.startLine, target.startColumn));
  } else {
    lines.push(`### \\#${markdownText(target.name)}`);
  }
  lines.push("", "#### Callers");
  lines.push(...linkLines(callers, path.folder, project), "", "#### Callees");
  lines.push(...linkLines(callees, path.folder, project));
  return `${lines.join("\n")}\n`;
}

function linkLines(
  connections: readonly SymbolConnection[],
  cwd: string,
  project: string,
): string[] {
  if (connections.length === 0) return ["- none"];
  return connections.map((connection) => {
    const path = globalSymbolPathFor(connection as SymbolCandidate, cwd, project);
    const label = `${path.file || connection.filePath || connection.qualifiedName}#${
      connection.name || symbolTail(connection.qualifiedName)
    }`;
    return `- [${markdownText(label)}](${path.toLocation(connection.startLine, connection.startColumn)})`;
  });
}

function jsonFor(
  path: GlobalSymbolPath,
  target: AiTarget,
  callers: readonly SymbolConnection[],
  callees: readonly SymbolConnection[],
  project: string,
): AiJson {
  return {
    self: path.toDisplay(),
    location: path.toLocation(target.startLine, target.startColumn),
    callers: linksJson(callers, path.folder, project),
    callees: linksJson(callees, path.folder, project),
  };
}

function linksJson(
  connections: readonly SymbolConnection[],
  cwd: string,
  project: string,
): Record<string, AiLink> {
  const links: Record<string, AiLink> = {};
  for (const connection of connections) {
    const path = globalSymbolPathFor(connection as SymbolCandidate, cwd, project);
    const key = path.toDisplay() || connection.qualifiedName;
    links[key] = {
      label: connection.name || symbolTail(connection.qualifiedName),
      file: path.file || connection.filePath || "",
      line: positiveInteger(connection.startLine),
      column: positiveInteger(connection.startColumn),
      symbolPath: path.toDisplay(),
      location: path.toLocation(connection.startLine, connection.startColumn),
    };
  }
  return links;
}

function symbolTail(qualifiedName: string): string {
  return qualifiedName.split(".").at(-1) ?? qualifiedName;
}

function markdownText(value: string): string {
  return value.replace(/([\\`*_[\]()])/g, "\\$1");
}

function positiveInteger(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1;
}
