import { describe, expect, test } from "bun:test";

import { createGraphUiState } from "../src/lib/state/code-graph";
import { applyGraphUrlToState, graphUrlParams } from "../src/lib/state/url-sync";

describe("state URL bridge", () => {
  test("applies query params into the central state", () => {
    const state = createGraphUiState();
    applyGraphUrlToState(
      state,
      "?source=cbm&project=p&symbol=p.main&renderer=orchgraph&depth=&direction=callers&layout=force",
    );
    expect(state.setup.source).toBe("cbm");
    expect(state.setup.project).toBe("p");
    expect(state.setup.entry).toBe("p.main");
    expect(state.current.view.renderer).toBe("orchgraph");
    expect(state.current.view.depth).toBeNull();
    expect(state.current.view.direction).toBe("callers");
    expect(state.current.view.layout).toBe("force");
  });

  test("keeps the canonical depth slot for an empty depth", () => {
    const state = createGraphUiState();
    const params = graphUrlParams(state, null);
    expect(params.get("depth")).toBe("");
    expect(params.get("source")).toBe("computed");
  });
});
