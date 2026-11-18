import { describe, expect, test } from "bun:test";

import { fuzzyMatch } from "../src/lib/components/code-input-filter";
import type { NormalizedCodeInputOption } from "../src/lib/components/code-input-options";

const option: NormalizedCodeInputOption = {
  label: "graph-ui-svelte.src.App",
  value: "graph-ui-svelte.src.App",
  description: "module · src/App.svelte",
};

describe("CodeInput fuzzy matching", () => {
  test("matches subsequences in labels and descriptions", () => {
    expect(fuzzyMatch(option, "gsa")).toBe(true);
    expect(fuzzyMatch(option, "App")).toBe(true);
    expect(fuzzyMatch(option, "src.App")).toBe(true);
  });

  test("rejects queries with no candidate subsequence", () => {
    expect(fuzzyMatch(option, "p")).toBe(false);
    expect(fuzzyMatch(option, "zzzz")).toBe(false);
    expect(fuzzyMatch(option, "graph-z")).toBe(false);
  });
});
