import { expect, test } from "bun:test";

import {
  acceptRootPicker,
  paintRootPicker,
  pickerIndex,
  type RootPickerActions,
  type RootPickerPanel,
} from "../tui/root-picker.ts";

let lastEntries: Record<string, unknown>[] = [];

const roots = [
  {
    qualifiedName: "p.main",
    name: "main",
    label: "Function",
    filePath: "src/main.ts",
    startLine: 1,
    reason: "name main",
    kind: "entry" as const,
  },
  {
    qualifiedName: "p.src.App",
    name: "App",
    label: "Module",
    filePath: "src/App.svelte",
    startLine: 1,
    reason: "module",
    kind: "module" as const,
  },
];

function panel(): RootPickerPanel {
  return {
    bufferId: 1,
    picker: null,
    entry: "",
    headerRows: 0,
    selectedNodeId: null,
  };
}

function actions(calls: string[], cursorRow = 2): RootPickerActions {
  return {
    setContent: (_lines, entries) => {
      lastEntries = entries;
      calls.push("setContent");
    },
    setCursor: (row) => calls.push("cursor:" + row),
    cursorRow: () => cursorRow,
    clearNamespace: () => calls.push("clearNamespace"),
    setStatus: (message) => calls.push("status:" + message),
    setEntry: (entry) => calls.push("entry:" + entry),
    reload: () => calls.push("reload"),
    renderFrame: () => calls.push("render"),
    openSelected: () => calls.push("openSelected"),
    promptEntry: async () => {
      calls.push("prompt");
    },
  };
}

test("root picker paints headers, candidates, and hit rows", () => {
  const state = panel();
  const calls: string[] = [];
  paintRootPicker(state, roots, 1, actions(calls));

  expect(state.picker?.selected).toBe(1);
  expect(calls).toContain("setContent");
  expect(lastEntries[1]?.text).toContain("Select root");
  expect(pickerIndex(state, 1)).toBeNull();
  expect(pickerIndex(state, 2)).toBe(0);
  expect(pickerIndex(state, 3)).toBe(1);
  expect(pickerIndex(state, 4)).toBeNull();
});

test("root picker accept updates the entry and reloads", () => {
  const state = panel();
  const calls: string[] = [];
  paintRootPicker(state, roots, 0, actions(calls));
  acceptRootPicker(state, actions(calls));
  expect(calls).toContain("entry:p.main");
  expect(calls).toContain("reload");
  expect(state.picker).toBeNull();
});

test("root picker accept uses the native cursor row", () => {
  const state = panel();
  const calls: string[] = [];
  paintRootPicker(state, roots, 0, actions(calls));
  acceptRootPicker(state, actions(calls, 3));
  expect(calls).toContain("entry:p.src.App");
});
