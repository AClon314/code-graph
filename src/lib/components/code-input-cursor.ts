/** Cursor mapping shared by the idle native input and CodeMirror. */

export interface CodeInputSelection {
  anchor: number;
  head: number;
}

/** Map an idle-input selection onto an expanded/edited value. */
export function selectionFor(
  selection: CodeInputSelection,
  fromDoc: string,
  toDoc: string,
): CodeInputSelection {
  const offset = toDoc.endsWith(fromDoc) ? toDoc.length - fromDoc.length : 0;
  const clamp = (position: number) => Math.max(0, Math.min(toDoc.length, position + offset));
  return { anchor: clamp(selection.anchor), head: clamp(selection.head) };
}

/** Keep the caret on the same text when an external value update arrives. */
export function mapCursor(fromDoc: string, toDoc: string, position: number): number {
  if (fromDoc === toDoc) return position;
  if (position === fromDoc.length) return toDoc.length;
  if (toDoc.endsWith(fromDoc)) return position + toDoc.length - fromDoc.length;
  if (toDoc.startsWith(fromDoc)) return position;
  return Math.min(position, toDoc.length);
}
