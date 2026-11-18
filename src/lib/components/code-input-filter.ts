import type { NormalizedCodeInputOption } from "./code-input-options";

/**
 * Match candidates using the same visible text CodeMirror filters (the label).
 * Single-character queries only match a label prefix, matching CodeMirror's
 * default matcher; longer queries accept a substring or ordered subsequence.
 */
export function fuzzyMatch(option: NormalizedCodeInputOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const text = option.label.toLowerCase();
  if (needle.length === 1) return text.startsWith(needle);
  if (text.includes(needle)) return true;
  let index = 0;
  for (const char of needle) {
    index = text.indexOf(char, index);
    if (index < 0) return false;
    index += 1;
  }
  return true;
}
