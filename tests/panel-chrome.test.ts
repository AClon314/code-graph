import { expect, test } from "bun:test";

import { headerLines, toolbarActionAt, toolbarLabel } from "../tui/panel-chrome.ts";

test("graph toolbar advertises its key and click actions", () => {
  expect(toolbarLabel(false)).toBe("[H] Help  [E] Entry  [R] Reload  [F] Config  [T] Render  [C] Close");
  expect(toolbarLabel(true)).toContain("[G] Graph");
  expect(headerLines(false)).toEqual([toolbarLabel(false), ""]);
});

test("toolbar hit-testing follows the rendered columns", () => {
  const text = toolbarLabel(false);
  expect(toolbarActionAt(false, text.indexOf("[H]"))).toBe("help");
  expect(toolbarActionAt(false, text.indexOf("[E]"))).toBe("entry");
  expect(toolbarActionAt(false, text.indexOf("[R]"))).toBe("reload");
  expect(toolbarActionAt(false, text.indexOf("[F] Config"))).toBe("config");
  expect(toolbarActionAt(false, text.indexOf("[T]"))).toBe("renderer");
  expect(toolbarActionAt(false, text.lastIndexOf("[C]"))).toBe("close");
  expect(toolbarActionAt(false, text.length + 1)).toBeNull();
});
