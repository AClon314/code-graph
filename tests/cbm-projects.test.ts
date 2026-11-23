import { describe, expect, test } from "bun:test";

import {
  cbmProjectNameFromPath,
  fetchCbmProjects,
  parseCbmProjects,
  staleCbmProjects,
  type CbmFetch,
} from "../src/lib/cbm-projects";

const sample = `projects_refs: 2  (cols: id prefix)
  0 /home/me/work
projects_ref_rule: @N+suffix=prefix+suffix
projects: 3  (cols: name root_path branch)
  project-a @0+app main
  project-b /srv/b -
  project-a @0+app main
total: 3
returned: 3
has_more: false`;

describe("cbm project discovery", () => {
  test("parses the list_projects table without refs", () => {
    expect(parseCbmProjects(sample)).toEqual(["project-a", "project-b"]);
  });

  test("returns no projects for unrelated text", () => {
    expect(parseCbmProjects("error: unavailable")).toEqual([]);
    expect(parseCbmProjects("")).toEqual([]);
  });

  test("fetches through the read-only /rpc endpoint", async () => {
    const calls: unknown[] = [];
    const fetchCbm: CbmFetch = async (request) => {
      calls.push(request);
      return {
        status: 200,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: sample }] },
        }),
      };
    };
    await expect(fetchCbmProjects(fetchCbm)).resolves.toEqual([
      "project-a",
      "project-b",
    ]);
    expect(calls[0]).toMatchObject({ path: "/rpc", method: "POST" });
  });

  test("derives the same default project name as cbm", () => {
    expect(
      cbmProjectNameFromPath("/home/n/document/code/gpen/gpen-js/rules/cbm/graph-ui-svelte"),
    ).toBe("home-n-document-code-gpen-gpen-js-rules-cbm-graph-ui-svelte");
    expect(cbmProjectNameFromPath("/tmp/我的 project")).toBe("tmp-e68891e79a84-project");
  });

  test("selects projects whose last index is older than the cutoff", async () => {
    const fetchCbm: CbmFetch = async (request) => {
      if (request.path === "/rpc") {
        return {
          status: 200,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "text", text: sample }] },
          }),
        };
      }
      const name = request.query?.name;
      return {
        status: 200,
        body: JSON.stringify({
          status: "healthy",
          indexed_at: name === "project-a" ? "2026-01-01T00:00:00Z" : "2026-11-01T00:00:00Z",
        }),
      };
    };
    await expect(
      staleCbmProjects(fetchCbm, 30, Date.parse("2026-11-23T00:00:00Z")),
    ).resolves.toEqual([{ name: "project-a", rootPath: "@0+app", branch: "main" }]);
  });

  test("does not throw on malformed RPC responses", async () => {
    await expect(
      fetchCbmProjects(async () => ({ status: 200, body: "not json" })),
    ).resolves.toEqual([]);
    await expect(
      fetchCbmProjects(async () => ({ status: 500, body: "" })),
    ).resolves.toEqual([]);
  });
});
