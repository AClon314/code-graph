import type { Transaction } from "@codemirror/state";

/** Flatten newlines and enforce maxlength for the single-line field. */
export function singleLineAndLimit(
  transaction: Transaction,
  maxlength: number | undefined,
): Transaction {
  if (!transaction.docChanged) return transaction;
  let text = transaction.newDoc.toString();
  let changed = false;
  if (/[\r\n]/.test(text)) {
    text = text.replace(/[\r\n]+/g, " ");
    changed = true;
  }
  if (maxlength !== undefined && text.length > maxlength) {
    text = text.slice(0, maxlength);
    changed = true;
  }
  if (!changed) return transaction;
  return transaction.startState.update({
    changes: {
      from: 0,
      to: transaction.startState.doc.length,
      insert: text,
    },
    selection: { anchor: text.length },
  });
}
