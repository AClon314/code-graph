/**
 * Compact qualified names for the card subtitle.
 *
 * The project prefix repeats on every node; it is already shown in the header
 * and in Setup. Keep at most the last five segments, prefixed with an ellipsis
 * when segments were dropped, e.g.
 *
 *   graph-ui-svelte-scip.src.utils.date -> …src.utils.date
 */
export function shortQualifiedName(
  qualifiedName: string,
  project?: string,
): string {
  let value = qualifiedName.trim();
  if (project && value.startsWith(`${project}.`)) {
    value = value.slice(project.length + 1);
  }
  const segments = value.split(".").filter(Boolean);
  if (segments.length > 5) return `…${segments.slice(-5).join(".")}`;
  return value || qualifiedName;
}

/** Tail of a file path for templates that prefer a file over a QN. */
export function shortFilePath(filePath?: string): string {
  if (!filePath) return "";
  const parts = filePath.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 3) return parts.join("/");
  return `…/${parts.slice(-3).join("/")}`;
}
