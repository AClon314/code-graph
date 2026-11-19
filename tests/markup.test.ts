import { describe, expect, test } from "bun:test";

import { kindClass, pointList } from "../src/lib/graph/markup";

describe("shared graph markup helpers", () => {
  test("normalizes arbitrary labels into stable CSS kind tokens", () => {
    expect(kindClass("Function")).toBe("Function");
    expect(kindClass("foo::bar<T>")).toBe("foo-bar-T");
    expect(kindClass("???")).toBe("unknown");
  });

  test("serializes SVG points without changing numeric values", () => {
    expect(pointList([{ x: 0, y: 1.5 }, { x: 20, y: 30 }])).toBe("0,1.5 20,30");
  });
});
