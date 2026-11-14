import { expect, test } from "bun:test";

import {
  copyPathText,
  formatLocation,
  pathFormats,
} from "../src/lib/path-location";

test("formats relative and absolute paths from a POSIX workspace root", () => {
  expect(pathFormats("src/main.ts", "/repo")).toEqual({
    relative: "src/main.ts",
    absolute: "/repo/src/main.ts",
  });
  expect(pathFormats("/repo/src/main.ts", "/repo/")).toEqual({
    relative: "src/main.ts",
    absolute: "/repo/src/main.ts",
  });
  expect(pathFormats("/elsewhere/main.ts", "/repo")).toEqual({
    relative: null,
    absolute: "/elsewhere/main.ts",
  });
  expect(pathFormats("src/main.ts", "/")).toEqual({
    relative: "src/main.ts",
    absolute: "/src/main.ts",
  });
});

test("normalizes Windows separators and compares drive paths case-insensitively", () => {
  expect(pathFormats("src\\main.ts", "C:\\repo\\")).toEqual({
    relative: "src/main.ts",
    absolute: "C:/repo/src/main.ts",
  });
  expect(pathFormats("c:\\repo\\src\\main.ts", "C:\\repo")).toEqual({
    relative: "src/main.ts",
    absolute: "c:/repo/src/main.ts",
  });
});

test("copy payloads always include line and column", () => {
  const formats = pathFormats("src/main.ts", "/repo");
  const location = { line: 5, column: 2 };

  expect(formatLocation("src/main.ts", 5, 2)).toBe("src/main.ts:5:2");
  expect(formatLocation("src/main.ts", 0, 0)).toBe("src/main.ts:1:1");
  expect(copyPathText("relative", formats, location.line, location.column)).toBe(
    "src/main.ts:5:2",
  );
  expect(copyPathText("absolute", formats, location.line, location.column)).toBe(
    "/repo/src/main.ts:5:2",
  );
  expect(copyPathText("both", formats, location.line, location.column)).toBe(
    "src/main.ts:5:2\n/repo/src/main.ts:5:2",
  );
});

test("copy payloads report unavailable forms instead of inventing paths", () => {
  expect(copyPathText("absolute", { relative: "src/a.ts", absolute: null }, 1, 1)).toBeNull();
  expect(copyPathText("both", { relative: null, absolute: "/a.ts" }, 1, 1)).toBeNull();
});
