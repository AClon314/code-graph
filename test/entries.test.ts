import { expect, test } from "bun:test";

import { entryCandidates } from "../src/lib/graph/entries";

test("entry candidates keep cbm/main/exported functions and dedupe", () => {
  const candidates = entryCandidates([
    {
      name: "main",
      label: "Function",
      qualified_name: "p.src.main",
      file_path: "src/main.ts",
      start_line: 3,
      is_entry: true,
    },
    {
      name: "helper",
      label: "Function",
      qualified_name: "p.src.helper",
      file_path: "src/helper.ts",
      start_line: 1,
      is_exported: true,
    },
    {
      name: "helper",
      label: "Function",
      qualified_name: "p.src.helper",
      file_path: "src/helper.ts",
      start_line: 1,
      is_exported: true,
    },
    {
      name: "data",
      label: "Class",
      qualified_name: "p.src.Data",
      is_entry: true,
    },
  ]);

  expect(candidates.map((candidate) => candidate.qualifiedName)).toEqual([
    "p.src.main",
    "p.src.helper",
  ]);
  expect(candidates[0]?.reason).toContain("name main");
  expect(candidates[1]?.reason).toContain("exported");
});
