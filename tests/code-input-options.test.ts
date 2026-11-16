import { describe, expect, test } from "bun:test";

import {
  normalizeCodeInputOptions,
  resolveCodeInputOptions,
  type CodeInputOption,
} from "../src/lib/components/code-input-options";

describe("CodeInput options", () => {
  test("normalizes strings and objects", () => {
    expect(
      normalizeCodeInputOptions([
        "alpha",
        { value: "beta", label: "Beta", description: "second" },
      ]),
    ).toEqual([
      { value: "alpha", label: "alpha", description: undefined },
      { value: "beta", label: "Beta", description: "second" },
    ]);
  });

  test("accepts a static list or a lazy provider", async () => {
    const list: CodeInputOption[] = ["alpha"];
    expect(await resolveCodeInputOptions(list)).toEqual([
      { value: "alpha", label: "alpha", description: undefined },
    ]);
    expect(
      await resolveCodeInputOptions(() => [
        { value: "beta", label: "Beta" },
      ]),
    ).toEqual([{ value: "beta", label: "Beta", description: undefined }]);
  });

  test("supports async providers and empty/malformed input", async () => {
    expect(
      await resolveCodeInputOptions(async () => ["gamma"]),
    ).toEqual([{ value: "gamma", label: "gamma", description: undefined }]);
    expect(await resolveCodeInputOptions(undefined)).toEqual([]);
    expect(normalizeCodeInputOptions(null)).toEqual([]);
  });
});
