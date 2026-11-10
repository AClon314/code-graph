import { expect, test } from "bun:test";

import { isTypingTarget, resolveShortcut } from "../src/lib/shortcuts";

const closed = { setupOpen: false, inspectorOpen: false };

function event(key: string, extra: Record<string, unknown> = {}) {
  return { key, ...extra };
}

test("maps app keys after modifiers and repeat are filtered", () => {
  expect(resolveShortcut(event("s"), closed)).toBe("toggle-setup");
  expect(resolveShortcut(event("D"), closed)).toBe("toggle-details");
  expect(resolveShortcut(event("r"), closed)).toBe("reload");
  expect(resolveShortcut(event("f"), closed)).toBe("fit");
  expect(resolveShortcut(event("/"), closed)).toBe("search");
  expect(resolveShortcut(event("x"), closed)).toBeNull();
  expect(resolveShortcut(event("s", { ctrlKey: true }), closed)).toBeNull();
  expect(resolveShortcut(event("s", { repeat: true }), closed)).toBeNull();
});

test("Escape closes Setup before Details", () => {
  expect(resolveShortcut(event("Escape"), { setupOpen: true, inspectorOpen: true })).toBe(
    "close-setup",
  );
  expect(resolveShortcut(event("Escape"), { setupOpen: false, inspectorOpen: true })).toBe(
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
    resolveShortcut(event("Escape", { composedPath: () => path }), {
      setupOpen: false,
      inspectorOpen: true,
    }),
  ).toBe("close-details");
});

test("defaultPrevented is respected", () => {
  expect(resolveShortcut(event("s", { defaultPrevented: true }), closed)).toBeNull();
});
