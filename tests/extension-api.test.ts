import { afterEach, expect, test } from "bun:test";

import { createExtensionApi } from "../src/extension/hosts/fresh";

const calls: Array<{ path: string; line: number; column: number }> = [];
const statuses: string[] = [];

(globalThis as unknown as { getEditor: () => unknown }).getEditor = () => ({
  openFile(path: string, line: number, column: number) {
    calls.push({ path, line, column });
    return true;
  },
  setStatus(message: string) {
    statuses.push(message);
  },
});

afterEach(() => {
  calls.length = 0;
  statuses.length = 0;
  delete (globalThis as Record<string, unknown>).CODE_NAV_ROOT;
  delete (globalThis as Record<string, unknown>).CODE_NAV_PROJECT;
});

test("Fresh host resolves workspace-relative paths and opens 1-based locations", async () => {
  (globalThis as Record<string, unknown>).CODE_NAV_ROOT = "/repo/";
  const api = createExtensionApi();

  expect(api.runtime).toBe("fresh");
  await api.openLocation({ path: "src/a.ts", line: 3, column: 2 });
  expect(calls).toEqual([{ path: "/repo/src/a.ts", line: 3, column: 2 }]);

  await api.openLocation({ path: "/abs/b.ts", line: 0 });
  expect(calls[1]).toEqual({ path: "/abs/b.ts", line: 1, column: 1 });
});

test("Fresh host reads project configuration from the plugin globals", async () => {
  (globalThis as Record<string, unknown>).CODE_NAV_PROJECT = "p";
  const config = await createExtensionApi().getConfig();
  expect(config.project).toBe("p");
  expect(config.source).toBe("mock");
});

test("Fresh host forwards status messages to the editor", () => {
  createExtensionApi().setStatus("hello");
  expect(statuses).toEqual(["hello"]);
});
