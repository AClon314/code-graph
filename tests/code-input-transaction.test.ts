import { describe, expect, test } from "bun:test";

import { EditorState } from "@codemirror/state";
import { singleLineAndLimit } from "../src/lib/components/code-input-transaction";

function apply(state: EditorState, text: string, maxlength?: number) {
  const transaction = state.update({ changes: { from: 0, to: state.doc.length, insert: text } });
  return singleLineAndLimit(transaction, maxlength).newDoc.toString();
}

describe("CodeInput single-line transaction filter", () => {
  test("flattens newlines", () => {
    expect(apply(EditorState.create({ doc: "" }), "a\nb\r\nc")).toBe("a b c");
  });

  test("enforces maxlength after flattening", () => {
    expect(apply(EditorState.create({ doc: "" }), "abcdef", 4)).toBe("abcd");
  });

  test("leaves ordinary edits untouched", () => {
    const state = EditorState.create({ doc: "old" });
    expect(apply(state, "new", 10)).toBe("new");
  });
});
