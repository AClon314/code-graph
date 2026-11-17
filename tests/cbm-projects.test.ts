import { describe, expect, test } from "bun:test";

import {
  fetchCbmProjects,
  parseCbmProjects,
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

  test("does not throw on malformed RPC responses", async () => {
    await expect(
      fetchCbmProjects(async () => ({ status: 200, body: "not json" })),
    ).resolves.toEqual([]);
    await expect(
      fetchCbmProjects(async () => ({ status: 500, body: "" })),
    ).resolves.toEqual([]);
  });
});
