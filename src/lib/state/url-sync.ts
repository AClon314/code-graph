import {
  formatGraphUrl,
  parseGraphUrl,
  type GraphUrlLocation,
} from "../graph/url-state";
import type { GraphUiState } from "./code-graph";

/** Apply query params to the central state and return the location to restore. */
export function applyGraphUrlToState(state: GraphUiState, search: string): void {
  const next = parseGraphUrl(search, {
    source: state.setup.source,
    project: state.setup.project,
    symbol: state.setup.entry,
    renderer: state.current.view.renderer,
    depth: state.current.view.depth,
    direction: state.current.view.direction,
    layout: state.current.view.layout,
  });
  state.setup.source = next.source;
  state.setup.project = next.project;
  state.setup.entry = next.symbol;
  state.setup.refProject = next.project;
  state.current.view.renderer = next.renderer;
  state.current.view.depth = next.depth;
  state.current.view.direction = next.direction;
  state.current.view.layout = next.layout;
  state.current.navigation.pendingLocation = next.location;
}

/** Canonical query params for the current low-frequency state. */
export function graphUrlParams(
  state: GraphUiState,
  location: GraphUrlLocation | null,
): URLSearchParams {
  return new URLSearchParams(
    formatGraphUrl(
      {
        source: state.setup.source,
        project: state.setup.project,
        symbol: state.setup.entry,
        renderer: state.current.view.renderer,
        depth: state.current.view.depth,
        direction: state.current.view.direction,
        layout: state.current.view.layout,
      },
      location,
    ),
  );
}

/** Write the canonical current state to the address bar without navigating. */
export function syncGraphUrl(state: GraphUiState): void {
  if (typeof window === "undefined") return;
  const file =
    state.current.selection.node?.filePath ??
    state.current.detail.symbol?.node.filePath;
  const line =
    state.current.selection.node?.startLine ??
    state.current.detail.symbol?.node.startLine;
  const params = graphUrlParams(state, file && line ? { file, line } : null);
  // Keep embed-only knobs that are not part of the graph state.
  const currentParams = new URLSearchParams(window.location.search);
  for (const key of ["scale", "theme"]) {
    const value = currentParams.get(key);
    if (value) params.set(key, value);
  }
  const nextSearch = `?${params.toString()}`;
  if (window.location.search !== nextSearch) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch}${window.location.hash}`,
    );
  }
}
