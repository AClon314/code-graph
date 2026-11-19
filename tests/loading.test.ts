import { describe, expect, test } from "bun:test";

import { estimateEta, formatEta, progressLabel } from "../src/lib/graph/loading";

describe("loading progress", () => {
  test("does not invent an ETA before the first completed fetch", () => {
    expect(estimateEta({ completed: 0, total: 10, startedAt: 0 }, 1000)).toBeNull();
  });

  test("estimates from the completed-fetch rate", () => {
    expect(estimateEta({ completed: 2, total: 10, startedAt: 0 }, 1000)).toBe(4000);
    expect(estimateEta({ completed: 10, total: 10, startedAt: 0 }, 1000)).toBe(0);
  });

  test("formats compact durations", () => {
    expect(formatEta(null)).toBe("");
    expect(formatEta(400)).toBe("<1s");
    expect(formatEta(12_000)).toBe("12s");
    expect(formatEta(65_000)).toBe("1m 5s");
    expect(formatEta(120_000)).toBe("2m");
  });

  test("renders an indeterminate or determined status label", () => {
    const base = { label: "Loading graph", completed: 2, startedAt: 0, updatedAt: 0 };
    expect(progressLabel({ ...base, total: null, etaMs: null })).toBe("Loading graph");
    expect(progressLabel({ ...base, total: 10, etaMs: 4000 })).toBe("Loading graph 2/10 · ~4s");
  });
});
