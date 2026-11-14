export type PathCopyKind = "relative" | "absolute" | "both";

export interface PathFormats {
  relative: string | null;
  absolute: string | null;
}

function toSlash(value: string): string {
  return value.replace(/\\/g, "/");
}

function trimRoot(value: string): string {
  const normalized = toSlash(value).trim();
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
}

function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function trimRelative(value: string): string {
  return toSlash(value).replace(/^\.\//, "").replace(/^\/+/, "");
}

function samePrefix(value: string, root: string): boolean {
  const windows = /^[A-Za-z]:\//.test(root);
  return windows
    ? value.toLowerCase().startsWith(root.toLowerCase())
    : value.startsWith(root);
}

/** Relative + absolute forms of a workspace path, normalized to `/`. */
export function pathFormats(filePath: string, workspaceRoot: string): PathFormats {
  const file = toSlash(filePath).trim();
  if (!file) return { relative: null, absolute: null };

  const root = trimRoot(workspaceRoot.trim());
  if (isAbsolute(file)) {
    if (!root) return { relative: null, absolute: file };
    const comparable = file.replace(/\/+$/, "");
    const prefix = root === "/" ? "/" : `${root}/`;
    if (comparable === root || samePrefix(comparable, prefix)) {
      return {
        relative: trimRelative(comparable.slice(root.length)),
        absolute: comparable,
      };
    }
    return { relative: null, absolute: comparable };
  }

  const relative = trimRelative(file).replace(/\/+$/, "");
  return {
    relative,
    absolute: root ? `${root === "/" ? "" : root}/${relative}` : null,
  };
}

/** Format `path:line:column`, always with 1-based positions. */
export function formatLocation(
  filePath: string,
  line: number | undefined,
  column: number | undefined,
): string {
  const safeLine = positiveInteger(line);
  const safeColumn = positiveInteger(column);
  return `${filePath}:${safeLine}:${safeColumn}`;
}

/** Build the clipboard payload for one of the three copy actions. */
export function copyPathText(
  kind: PathCopyKind,
  formats: PathFormats,
  line: number | undefined,
  column: number | undefined,
): string | null {
  if (kind === "relative") {
    return formats.relative ? formatLocation(formats.relative, line, column) : null;
  }
  if (kind === "absolute") {
    return formats.absolute ? formatLocation(formats.absolute, line, column) : null;
  }
  if (!formats.relative || !formats.absolute) return null;
  return `${formatLocation(formats.relative, line, column)}\n${formatLocation(
    formats.absolute,
    line,
    column,
  )}`;
}

function positiveInteger(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1;
}
