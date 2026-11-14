import { expect, test } from "bun:test";

import {
  formatGraphUrl,
  parseGraphUrl,
  type GraphUrlState,
} from "../src/lib/graph/url-state";

const fallback: GraphUrlState = {
  source: "computed",
  project: "current-project",
  symbol: "current.symbol",
  renderer: "d3",
  depth: 2,
  direction: "both",
};

test("source defaults supply project and symbol", () => {
  expect(parseGraphUrl("?source=computed", fallback)).toEqual({
    ...fallback,
    project: "demo",
    symbol: "demo.src.features.useAlias",
    location: null,
  });

  expect(parseGraphUrl("?source=cbm", fallback)).toEqual({
    ...fallback,
    source: "cbm",
    project: "fixture-hard-scip",
    symbol: "fixture-hard-scip.src.features.useAlias",
    location: null,
  });
});

test("query values override source defaults and view options", () => {
  const parsed = parseGraphUrl(
    "?source=cbm&project=p&symbol=s&renderer=orchgraph&depth=3&direction=callers&file=src/a.ts&line=12",
    fallback,
  );

  expect(parsed).toEqual({
    source: "cbm",
    project: "p",
    symbol: "s",
    renderer: "orchgraph",
    depth: 3,
    direction: "callers",
    location: { file: "src/a.ts", line: 12 },
  });
});

test("missing source keeps the current state while still accepting overrides", () => {
  const parsed = parseGraphUrl(
    "?project=other&symbol=other.main&renderer=orchgraph&depth=1",
    fallback,
  );

  expect(parsed).toEqual({
    ...fallback,
    project: "other",
    symbol: "other.main",
    renderer: "orchgraph",
    depth: 1,
    location: null,
  });
});

test("invalid values fall back and invalid locations are ignored", () => {
  const parsed = parseGraphUrl(
    "?source=unknown&project=&symbol=&renderer=canvas&depth=9&direction=sideways&file=a.ts&line=0",
    fallback,
  );

  expect(parsed).toEqual({ ...fallback, location: null });
});

test("formatGraphUrl emits a canonical query with an optional location", () => {
  const state: GraphUrlState = {
    source: "cbm",
    project: "my project",
    symbol: "pkg.main",
    renderer: "orchgraph",
    depth: 1,
    direction: "callees",
  };

  expect(formatGraphUrl(state, null)).toBe(
    "?source=cbm&project=my+project&symbol=pkg.main&renderer=orchgraph&depth=1&direction=callees",
  );
  expect(formatGraphUrl(state, { file: "src/a b.ts", line: 7 })).toBe(
    "?source=cbm&project=my+project&symbol=pkg.main&renderer=orchgraph&depth=1&direction=callees&file=src%2Fa+b.ts&line=7",
  );
});
