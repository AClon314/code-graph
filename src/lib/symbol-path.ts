/**
 * Global symbol paths are the UI's portable, filesystem-based symbol identity:
 *
 *   <cwd>//<file-relative-to-cwd>#<symbol-unique-in-file>
 *
 * Examples:
 *   /home/me/gpen-js//src/lib/Button.svelte#Button.toggle
 *   gpen-js//src/lib/Button.svelte#Button.toggle   (compact display form)
 *
 * The `//` separator is deliberate: POSIX shells resolve it like `/`, so the
 * full string remains usable in a terminal while still being unambiguous next
 * to an absolute folder path. This class is the JS counterpart of a Python
 * `Symbol` value object; `toString()` is the `__str__` equivalent.
 *
 * Keep this module free of Svelte/DOM imports so CLI and Node hosts can share
 * it. `cwd` is passed explicitly where possible; `currentCwd()` is only the
 * fallback for callers that do not have a workspace root yet.
 */

export interface SymbolPathParts {
  folder?: string;
  file?: string;
  symbol?: string;
}

/** Anything the UI knows that can be addressed by a global symbol path. */
export interface SymbolCandidate {
  qualifiedName: string;
  name?: string;
  filePath?: string;
  label?: string;
  startLine?: number;
  startColumn?: number;
}

export function currentCwd(): string {
  const processLike = (globalThis as { process?: { cwd?: () => string } }).process;
  try {
    return processLike?.cwd?.() ?? "";
  } catch {
    return "";
  }
}

function toSlash(value: string): string {
  return value.replace(/\\/g, "/");
}

function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function trimTrailingSlash(value: string): string {
  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function trimRelative(value: string): string {
  return toSlash(value).replace(/^\.\//, "").replace(/^\/+/, "");
}

export function basenamePath(value: string): string {
  const normalized = trimTrailingSlash(toSlash(value));
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function dirnamePath(value: string): string {
  const normalized = trimTrailingSlash(toSlash(value));
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? (normalized.startsWith("/") ? "/" : "") : normalized.slice(0, index);
}

function joinPath(folder: string, file: string): string {
  if (!folder || folder === "/") return `/${trimRelative(file)}`;
  return `${trimTrailingSlash(folder)}/${trimRelative(file)}`;
}

function resolveFolder(folder: string, cwd: string): string {
  const value = trimTrailingSlash(toSlash(folder).trim());
  if (!value) return trimTrailingSlash(toSlash(cwd).trim());
  if (isAbsolute(value)) return value;
  const root = trimTrailingSlash(toSlash(cwd).trim());
  // `gpen-js//...` is the compact display form; resolve it back to cwd.
  if (root && (value === basenamePath(root) || value === `.${basenamePath(root)}`)) {
    return root;
  }
  return root ? joinPath(root, value) : value;
}

function relativeFile(value: string, folder: string): string {
  const file = trimRelative(value);
  if (!isAbsolute(toSlash(value).trim())) return file;
  const absolute = trimTrailingSlash(toSlash(value).trim());
  const root = trimTrailingSlash(folder);
  if (absolute === root) return "";
  const prefix = root === "/" ? "/" : `${root}/`;
  if (absolute.startsWith(prefix)) return absolute.slice(prefix.length);
  return `${basenamePath(absolute)}`;
}

/**
 * Parse the global path string. Missing folder parts fall back to `cwd`;
 * compact `folder//file#symbol` and full `cwd//file#symbol` forms are both
 * accepted. A bare absolute path is a folder-only selection.
 */
export function parseSymbolPath(
  value: string | SymbolPathParts | GlobalSymbolPath = "",
  cwd = currentCwd(),
): { folder: string; file: string; symbol: string } {
  if (value instanceof GlobalSymbolPath) {
    return { folder: value.folder, file: value.file, symbol: value.symbol };
  }
  if (typeof value !== "string") {
    const folder = resolveFolder(value.folder ?? "", cwd);
    const file = relativeFile(value.file ?? "", folder);
    return { folder, file, symbol: (value.symbol ?? "").trim() };
  }

  const input = toSlash(value).trim();
  const hash = input.indexOf("#");
  const pathPart = hash >= 0 ? input.slice(0, hash) : input;
  const symbol = hash >= 0 ? input.slice(hash + 1).trim() : "";
  const separator = pathPart.indexOf("//");

  if (separator >= 0) {
    const folder = resolveFolder(pathPart.slice(0, separator), cwd);
    const file = relativeFile(pathPart.slice(separator + 2), folder);
    return { folder, file, symbol };
  }

  if (hash >= 0) {
    if (isAbsolute(pathPart)) {
      const folder = dirnamePath(pathPart);
      return { folder, file: relativeFile(pathPart, folder), symbol };
    }
    const folder = resolveFolder("", cwd);
    return { folder, file: relativeFile(pathPart, folder), symbol };
  }

  // A bare absolute path is a folder-only selection (the default path bar).
  if (isAbsolute(pathPart)) return { folder: trimTrailingSlash(pathPart), file: "", symbol };

  if (pathPart.includes("/")) {
    const folder = resolveFolder("", cwd);
    return { folder, file: relativeFile(pathPart, folder), symbol };
  }

  // A bare folder/path (including the default cwd) has no file or symbol.
  return { folder: resolveFolder(pathPart, cwd), file: "", symbol };
}

/** True for values that should be parsed as a filesystem-based path. */
export function isGlobalSymbolPath(value: string): boolean {
  const input = value.trim();
  return input.includes("//") || input.includes("#") || isAbsolute(toSlash(input));
}

export class GlobalSymbolPath {
  readonly folder: string;
  readonly file: string;
  readonly symbol: string;

  constructor(value: string | SymbolPathParts | GlobalSymbolPath = "", cwd = currentCwd()) {
    const parsed = parseSymbolPath(value, cwd);
    this.folder = parsed.folder;
    this.file = parsed.file;
    this.symbol = parsed.symbol;
  }

  /** Full canonical form, including the absolute folder. */
  toString(): string {
    return `${this.folder}${this.file ? `//${this.file}` : ""}${
      this.symbol ? `#${this.symbol}` : ""
    }`;
  }

  /** Privacy-preserving form shown by the path bar: basename(folder)//file#symbol. */
  toDisplay(): string {
    const folder = basenamePath(this.folder) || this.folder;
    return `${folder}${this.file ? `//${this.file}` : ""}${
      this.symbol ? `#${this.symbol}` : ""
    }`;
  }

  /** Location suffix used by the forAI panel and copy actions. */
  toLocation(line?: number, column?: number): string {
    const safeLine = positiveInteger(line);
    const safeColumn = positiveInteger(column);
    return this.file ? `${this.file}#L${safeLine}C${safeColumn}` : this.toString();
  }

  get hasFile(): boolean {
    return Boolean(this.file);
  }
}

/**
 * Derive the symbol anchor from a project-qualified cbm name and the file path.
 * cbm QNs are project + file path segments + symbol name(s), so removing the
 * file tokens leaves the part that is unique inside that file.
 */
export function symbolAnchor(
  qualifiedName: string | undefined,
  filePath: string | undefined,
  fallbackName?: string,
): string {
  const qn = qualifiedName?.trim() ?? "";
  const fallback = fallbackName?.trim() ?? "";
  if (!qn) return fallback;

  const segments = qn.split(".").filter(Boolean);
  const fileTokens = trimRelative(toSlash(filePath ?? ""))
    .split("/")
    .filter(Boolean)
    .map((part, index, all) =>
      index === all.length - 1 ? part.replace(/\.[^.]+$/, "") : part,
    )
    .filter(Boolean);

  let start = lastSubsequence(segments, fileTokens);
  if (start < 0 && fileTokens.length > 0) {
    // Some backends normalize dots/hyphens in paths. Match the basename only
    // as a fallback, then keep everything after it.
    const base = fileTokens.at(-1) ?? "";
    start = segments.findIndex((segment) => segment.toLowerCase() === base.toLowerCase());
    if (start >= 0) {
      return segments.slice(start + 1).join(".") || fallback || base;
    }
  }

  if (start >= 0) {
    const rest = segments.slice(start + fileTokens.length);
    if (rest.length > 1 && isGenericNodeLabel(rest[0] ?? "")) {
      return rest.slice(1).join(".");
    }
    if (rest.length === 1 && isGenericNodeLabel(rest[0] ?? "")) {
      return fallback || rest[0] || "";
    }
    if (rest.length > 0) return rest.join(".");
  }

  if (fallback && qn.endsWith(fallback)) return fallback;
  return fallback || segments.at(-1) || "";
}

/** Build the path for a graph/root candidate, using `cwd` as the folder. */
export function globalSymbolPathFor(
  candidate: SymbolCandidate,
  cwd = currentCwd(),
): GlobalSymbolPath {
  const root = trimTrailingSlash(toSlash(cwd).trim());
  const rawFile = toSlash(candidate.filePath ?? "").trim();

  if (!rawFile) {
    return new GlobalSymbolPath({ folder: root, file: "", symbol: "" }, root);
  }

  if (isAbsolute(rawFile)) {
    const file = relativeFile(rawFile, root);
    return new GlobalSymbolPath(
      {
        folder: root || dirnamePath(rawFile),
        file,
        symbol: symbolAnchor(candidate.qualifiedName, file, candidate.name),
      },
      root,
    );
  }

  return new GlobalSymbolPath(
    {
      folder: root,
      file: trimRelative(rawFile),
      symbol: symbolAnchor(candidate.qualifiedName, rawFile, candidate.name),
    },
    root,
  );
}

/**
 * Resolve a parsed global path against known graph/root candidates. Exact
 * anchors win; a trailing anchor match is the forgiving fallback for callers
 * that omit a class prefix.
 */
export function resolveGlobalSymbolPath(
  path: GlobalSymbolPath,
  candidates: readonly SymbolCandidate[],
): SymbolCandidate | null {
  if (!path.file) return null;
  const inFile = candidates.filter((candidate) => fileMatches(candidate.filePath, path));
  if (inFile.length === 0) return null;
  if (!path.symbol) {
    return (
      inFile.find((candidate) => candidate.label === "Module") ??
      inFile.find((candidate) => candidate.name === basenamePath(path.file)) ??
      inFile[0] ??
      null
    );
  }

  const exact = inFile.find(
    (candidate) =>
      symbolAnchor(candidate.qualifiedName, candidate.filePath, candidate.name) === path.symbol,
  );
  if (exact) return exact;
  return (
    inFile.find((candidate) => {
      const anchor = symbolAnchor(candidate.qualifiedName, candidate.filePath, candidate.name);
      return (
        anchor.endsWith(`.${path.symbol}`) ||
        candidate.name === path.symbol ||
        candidate.qualifiedName.endsWith(`.${path.symbol}`)
      );
    }) ?? null
  );
}

function fileMatches(filePath: string | undefined, path: GlobalSymbolPath): boolean {
  const raw = toSlash(filePath ?? "").trim();
  if (!raw) return false;
  const file = isAbsolute(raw) ? relativeFile(raw, path.folder) : trimRelative(raw);
  return file === path.file;
}

function lastSubsequence(haystack: readonly string[], needle: readonly string[]): number {
  if (needle.length === 0) return -1;
  for (let start = haystack.length - needle.length; start >= 0; start -= 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return start;
  }
  return -1;
}

function isGenericNodeLabel(value: string): boolean {
  return /^(Module|Function|Class|Interface|Method|Constructor|Variable|Constant|Property)$/.test(
    value,
  );
}

function positiveInteger(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1;
}
