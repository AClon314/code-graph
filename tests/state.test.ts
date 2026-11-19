import { describe, expect, test } from "bun:test";

import { createGraphUiState } from "../src/lib/state/code-graph";

describe("JSON-safe graph state", () => {
  test("defaults to an empty depth and the full graph", () => {
    const state = createGraphUiState();
    expect(state.current.view.depth).toBeNull();
    expect(state.current.view.focusOnly).toBe(false);
  });

  test("round-trips through JSON without losing the low-frequency fields", () => {
    const state = createGraphUiState({ runtime: "webview", project: "fixture" });
    state.current.view.depth = 3;
    state.current.selection.id = "pkg.main";
    state.current.graph = {
      root: "pkg.main",
      nodes: [{ id: "pkg.main", label: "Function", name: "main", qualifiedName: "pkg.main" }],
      edges: [],
      truncated: false,
    };

    const roundTrip = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(roundTrip.current.view.depth).toBe(3);
    expect(roundTrip.current.selection.id).toBe("pkg.main");
    expect(roundTrip.current.graph?.nodes[0]?.qualifiedName).toBe("pkg.main");
    expect(roundTrip.setup.project).toBe("fixture");
  });
});
