import { describe, expect, test } from "bun:test";

import { mapCursor, selectionFor } from "../src/lib/components/code-input-cursor";

describe("CodeInput cursor mapping", () => {
  test("shifts an idle selection when a prefix is expanded", () => {
    expect(selectionFor({ anchor: 2, head: 2 }, "gpen-js//a", "/home/me/gpen-js//a")).toEqual({
      anchor: 11,
      head: 11,
    });
  });

  test("keeps the caret at the end for ordinary external updates", () => {
    expect(mapCursor("old", "older", 3)).toBe(5);
    expect(mapCursor("old", "old!", 1)).toBe(1);
    expect(mapCursor("old", "new", 2)).toBe(2);
  });
});
