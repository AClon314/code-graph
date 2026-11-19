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
