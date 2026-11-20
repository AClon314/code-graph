import { describe, expect, test } from "bun:test";

import { browseCbmFolders, fetchCbmIndexJobs, startCbmIndex } from "../src/lib/cbm-index";
import type { CbmFetch } from "../src/lib/cbm-projects";

function fakeFetch(
  body: unknown,
  status = 200,
): { fetchCbm: CbmFetch; calls: Array<{ path: string; method?: string; query?: Record<string, string>; body?: string }> } {
  const calls: Array<{ path: string; method?: string; query?: Record<string, string>; body?: string }> = [];
  return {
    calls,
    async fetchCbm(request) {
      calls.push(request);
      return { status, body: JSON.stringify(body) };
    },
  };
}

describe("shared cbm index actions", () => {
  test("starts an index job with the folder and project name", async () => {
    const fake = fakeFetch({ status: "indexing", slot: 2, path: "/repo" }, 202);
    await expect(startCbmIndex(fake.fetchCbm, "/repo", "repo")).resolves.toEqual({
      slot: 2,
      path: "/repo",
    });
    expect(fake.calls[0]).toMatchObject({ path: "/api/index", method: "POST" });
    expect(JSON.parse(fake.calls[0]!.body!)).toEqual({
      root_path: "/repo",
      project_name: "repo",
    });
  });

  test("reads job states defensively", async () => {
    const fake = fakeFetch([
      { slot: 0, status: "done", path: "/a", error: "" },
      { slot: 1, status: "weird", path: 3 },
    ]);
    await expect(fetchCbmIndexJobs(fake.fetchCbm)).resolves.toEqual([
      { slot: 0, status: "done", path: "/a", error: "" },
      { slot: 1, status: "unknown", path: "", error: "" },
    ]);
  });

  test("browses the server filesystem and exposes roots", async () => {
    const fake = fakeFetch({ path: "/repo", dirs: ["src", 4], parent: "/", roots: [] });
    await expect(browseCbmFolders(fake.fetchCbm, "/repo")).resolves.toEqual({
      path: "/repo",
      dirs: ["src"],
      parent: "/",
      roots: [],
    });
    expect(fake.calls[0]!.query).toEqual({ path: "/repo" });
  });

  test("reports the server error body", async () => {
    const fake = fakeFetch({ error: "directory not found" }, 400);
    await expect(startCbmIndex(fake.fetchCbm, "/missing", "x")).rejects.toThrow(
      "HTTP 400",
    );
  });
});
