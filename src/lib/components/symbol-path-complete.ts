/**
 * Completion for the path bar's project/folder prefix.
 *
 * Project matches are fuzzy and always come first. A filesystem listing is
 * added only when the cursor is inside a path (there is a `/` before it).
 * Each completion carries its own replacement range because the two modes
 * replace different tokens.
 */
import {
  closeCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { browseCbmFolders, type CbmBrowseLevel } from "../cbm-index";
import type { CbmFetch, CbmProject } from "../cbm-projects";
import { fuzzyMatch } from "./code-input-filter";
import { toUnixPath } from "../symbol-path";

export interface SymbolPathCompletionOptions {
  cwd: string;
  projects: readonly CbmProject[];
  fetchCbm?: CbmFetch;
}

const browseCache = new Map<string, Promise<CbmBrowseLevel>>();

export function browseCbmPath(
  fetchCbm: CbmFetch | undefined,
  path: string,
): Promise<CbmBrowseLevel> | null {
  if (!fetchCbm) return null;
  const key = path;
  const cached = browseCache.get(key);
  if (cached) return cached;
  const request = browseCbmFolders(fetchCbm, path).catch((cause) => {
    browseCache.delete(key);
    console.warn(`[code-graph] browse ${path || "roots"} failed`, cause);
    throw cause;
  });
  browseCache.set(key, request);
  return request;
}

/** Build the async CodeMirror source for one SymbolPathField instance. */
export function symbolPathCompletionSource(
  options: SymbolPathCompletionOptions,
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const text = toUnixPath(context.state.doc.toString());
    const cursor = context.pos;
    if (text.slice(0, cursor).includes("#")) return null;

    const separator = text.indexOf("//");
    const projectEnd = separator >= 0 && cursor >= separator ? separator : cursor;
    const projectText = text.slice(0, projectEnd);
    const projectOptions = !projectText.includes("/")
      ? projectCompletions(projectText, options.projects, projectEnd)
      : [];

    const fs = filesystemContext(text, cursor, separator, options);
    const fsOptions = fs ? await filesystemCompletions(fs, options) : [];
    const all = [...projectOptions, ...fsOptions];
    if (all.length === 0) return null;

    return {
      from: 0,
      to: text.length,
      filter: false,
      options: all,
    };
  };
}

function projectCompletions(
  query: string,
  projects: readonly CbmProject[],
  replaceTo: number,
): Completion[] {
  return projects
    .filter((project) => fuzzyMatch({ value: project.name, label: project.name }, query))
    .slice(0, 24)
    .map((project) => ({
      label: project.name,
      detail: project.rootPath,
      type: "namespace",
      apply: applyCompletion(0, replaceTo, `${project.name}//`),
    }));
}

interface FileSystemContext {
  browsePath: string;
  tokenFrom: number;
  tokenTo: number;
}

function filesystemContext(
  text: string,
  cursor: number,
  separator: number,
  options: SymbolPathCompletionOptions,
): FileSystemContext | null {
  const before = text.slice(0, cursor);
  if (!before.includes("/")) return null;

  const inFile = separator >= 0 && cursor > separator + 1;
  const partStart = inFile ? separator + 2 : 0;
  const part = text.slice(partStart, cursor);
  if (!part) {
    // `project//` → browse the project root (or cwd for `//`).
    const projectName = inFile ? text.slice(0, separator) : "";
    const root = projectName
      ? options.projects.find((project) => project.name === projectName)?.rootPath
      : "";
    if (!root && !inFile) return null;
    return {
      browsePath: root || options.cwd,
      tokenFrom: cursor,
      tokenTo: cursor,
    };
  }

  const slash = part.lastIndexOf("/");
  const directoryPart =
    slash > 0 ? part.slice(0, slash) : slash === 0 && part.startsWith("/") ? "/" : "";
  const base = inFile
    ? options.projects.find((project) => project.name === text.slice(0, separator))?.rootPath ||
      options.cwd
    : options.cwd;
  const browsePath = directoryPart.startsWith("/")
    ? directoryPart || "/"
    : joinPath(base, directoryPart);
  const tokenFrom = partStart + Math.max(0, slash + 1);
  const next = text.indexOf("/", cursor);
  const tokenTo = next >= 0 ? next : cursor;
  return { browsePath, tokenFrom, tokenTo };
}

async function filesystemCompletions(
  context: FileSystemContext,
  options: SymbolPathCompletionOptions,
): Promise<Completion[]> {
  const request = browseCbmPath(options.fetchCbm, context.browsePath);
  const level = request ? await request.catch(() => null) : null;
  if (!level) return [];
  const dirs = level.dirs;
  return dirs.slice(0, 128).map((dir) => {
    const label = `${dir}/`;
    return {
      label,
      detail: context.browsePath,
      type: "folder",
      apply: applyCompletion(context.tokenFrom, context.tokenTo, label),
    };
  });
}

function applyCompletion(
  from: number,
  to: number,
  value: string,
): (view: EditorView) => void {
  return (view: EditorView) => {
    view.dispatch({
      changes: { from, to, insert: value },
      selection: { anchor: from + value.length },
    });
    closeCompletion(view);
  };
}

function joinPath(base: string, path: string): string {
  if (!path) return base;
  if (path.startsWith("/")) return path;
  return `${base.replace(/\/+$/, "")}/${path}`;
}
