import { expect, test } from "bun:test";

import { isTypingTarget, resolveShortcut } from "../src/lib/shortcuts";

const closed = { setupOpen: false, inspectorOpen: false, hasSelection: false };
const active = { ...closed, hasSelection: true };

function event(key: string, extra: Record<string, unknown> = {}) {
  return { key, ...extra };
}

test("maps app keys after modifiers and repeat are filtered", () => {
  expect(resolveShortcut(event("s"), closed)).toBe("toggle-setup");
  expect(resolveShortcut(event("D"), closed)).toBe("toggle-details");
  expect(resolveShortcut(event("r"), closed)).toBe("reload");
  expect(resolveShortcut(event("f"), closed)).toBe("fit");
  expect(resolveShortcut(event("."), closed)).toBe("fit");
  expect(resolveShortcut(event("/"), closed)).toBe("search");
  expect(resolveShortcut(event("x"), closed)).toBeNull();
  expect(resolveShortcut(event("s", { ctrlKey: true }), closed)).toBeNull();
  expect(resolveShortcut(event("s", { repeat: true }), closed)).toBeNull();
});

test("wasd navigates only when a node is active", () => {
  expect(resolveShortcut(event("w"), closed)).toBeNull();
  expect(resolveShortcut(event("a"), closed)).toBeNull();
  expect(resolveShortcut(event("w"), active)).toBe("nav-callers");
  expect(resolveShortcut(event("s"), active)).toBe("nav-callees");
  expect(resolveShortcut(event("a"), active)).toBe("nav-prev-sibling");
  expect(resolveShortcut(event("d"), active)).toBe("nav-next-sibling");
});

test("camera and copy shortcuts", () => {
  expect(resolveShortcut(event("ArrowUp"), active)).toBe("pan-up");
  expect(resolveShortcut(event("ArrowLeft", { repeat: true }), active)).toBe("pan-left");
  expect(resolveShortcut(event("+"), active)).toBe("zoom-in");
  expect(resolveShortcut(event("="), active)).toBe("zoom-in");
  expect(resolveShortcut(event("-", { repeat: true }), active)).toBe("zoom-out");
  expect(resolveShortcut(event("c", { ctrlKey: true }), active)).toBe("copy-relative");
  expect(resolveShortcut(event("c", { ctrlKey: true }), closed)).toBeNull();
  expect(resolveShortcut(event("c", { ctrlKey: true, shiftKey: true }), closed)).toBe(
    "copy-relative-or-svg",
  );
});

test("Escape closes Setup before the forAI panel", () => {
  expect(resolveShortcut(event("Escape"), { setupOpen: true, inspectorOpen: true, hasSelection: false })).toBe(
    "close-setup",
  );
  expect(resolveShortcut(event("Escape"), { setupOpen: false, inspectorOpen: true, hasSelection: false })).toBe(
    "close-details",
  );
  expect(resolveShortcut(event("Escape"), closed)).toBeNull();
});

test("typing targets suppress shortcuts but not Escape", () => {
  const input = { matches: (selector: string) => selector.includes("input") };
  const path = [input];

  expect(isTypingTarget(path)).toBe(true);
  expect(resolveShortcut(event("s", { composedPath: () => path }), closed)).toBeNull();
  expect(
    resolveShortcut(event("c", { ctrlKey: true, composedPath: () => path }), active),
  ).toBeNull();
  expect(
    resolveShortcut(event("Escape", { composedPath: () => path }), {
      setupOpen: false,
      inspectorOpen: true,
      hasSelection: true,
    }),
  ).toBe("close-details");
});

test("defaultPrevented is respected", () => {
  expect(resolveShortcut(event("s", { defaultPrevented: true }), closed)).toBeNull();
});
