import type { SymbolBundle } from "./types";

/** Return the normalized entry text, or null when it is not a valid graph root. */
export function normalizeEntry(value: string): string | null {
  const next = value.trim();
  if (!next || /\s/.test(next)) return null;
  if (next.startsWith("#")) return /^\d+$/.test(next.slice(1)) ? next : null;
  return next;
}

/** Reuse a loaded detail bundle when it is the graph root. */
export function bundleForRef(
  bundle: SymbolBundle | null,
  value: string,
): SymbolBundle | undefined {
  if (!bundle) return undefined;
  if (value === bundle.node.qualifiedName) return bundle;
  if (bundle.node.id !== undefined && value === `#${bundle.node.id}`) return bundle;
  return undefined;
}
