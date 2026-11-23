import { describe, expect, test } from "bun:test";

import {
  GlobalSymbolPath,
  globalSymbolPathFor,
  isGlobalSymbolPath,
  parseSymbolPath,
  resolveGlobalSymbolPath,
  symbolAnchor,
} from "../src/lib/symbol-path";

const cwd = "/home/me/gpen-js";

describe("global symbol paths", () => {
  test("round-trips the full and compact forms", () => {
    const path = new GlobalSymbolPath(
      "/home/me/gpen-js//src/lib/Button.svelte#Button.toggle",
      cwd,
    );
    expect(path.folder).toBe(cwd);
    expect(path.file).toBe("src/lib/Button.svelte");
    expect(path.symbol).toBe("Button.toggle");
    expect(path.toString()).toBe("/home/me/gpen-js//src/lib/Button.svelte#Button.toggle");
    expect(path.toDisplay()).toBe("gpen-js//src/lib/Button.svelte#Button.toggle");
    expect(path.toLocation(2, 30)).toBe("src/lib/Button.svelte#L2C30");
  });

  test("accepts compact folders, relative files and a bare cwd", () => {
    expect(parseSymbolPath("gpen-js//src/a.ts#run", cwd)).toEqual({
      folder: cwd,
      file: "src/a.ts",
      symbol: "run",
    });
    expect(parseSymbolPath("src/a.ts#run", cwd)).toEqual({
      folder: cwd,
      file: "src/a.ts",
      symbol: "run",
    });
    expect(parseSymbolPath("//src/a.ts#run", cwd)).toEqual({
      folder: cwd,
      file: "src/a.ts",
      symbol: "run",
    });
    expect(parseSymbolPath(cwd, cwd)).toEqual({ folder: cwd, file: "", symbol: "" });
    expect(new GlobalSymbolPath(cwd, cwd).toDisplay()).toBe("gpen-js");
  });

  test("detects path-shaped values without treating a qualified name as one", () => {
    expect(isGlobalSymbolPath("gpen-js//src/a.ts#run")).toBe(true);
    expect(isGlobalSymbolPath("/repo")).toBe(true);
    expect(isGlobalSymbolPath("pkg.App.run")).toBe(false);
  });

  test("derives the in-file anchor from cbm qualified names", () => {
    expect(symbolAnchor("demo.src.lib.base.BaseRepo.get", "src/lib/base.ts", "get")).toBe(
      "BaseRepo.get",
    );
    expect(symbolAnchor("demo.src.features.useAlias", "src/features.ts", "useAlias")).toBe(
      "useAlias",
    );
    expect(symbolAnchor("pkg.src.App Module", "src/App.svelte", "App")).toBe("App");
  });

  test("builds and resolves a candidate path", () => {
    const candidate = {
      qualifiedName: "demo.src.main.main",
      name: "main",
      filePath: "src/main.ts",
      label: "Function",
    };
    const path = globalSymbolPathFor(candidate, cwd);
    expect(path.toDisplay()).toBe("gpen-js//src/main.ts#main");
    expect(resolveGlobalSymbolPath(path, [candidate])).toBe(candidate);

    const method = {
      qualifiedName: "demo.src.lib.base.BaseRepo.get",
      name: "get",
      filePath: "src/lib/base.ts",
      label: "Method",
    };
    expect(
      resolveGlobalSymbolPath(new GlobalSymbolPath("gpen-js//src/lib/base.ts#BaseRepo.get", cwd), [
        method,
      ]),
    ).toBe(method);
  });
});
