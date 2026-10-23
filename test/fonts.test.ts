import { describe, expect, test } from "bun:test";

import {
  createFontFallback,
  detectFamily,
  FONT_CDN_STYLESHEET,
  FONT_FAMILY,
  FONT_LOAD_SAMPLE,
  FONT_STATUS_ATTRIBUTE,
  fontFamilyExists,
} from "../src/lib/fonts";
import type {
  CanvasMeasureContext,
  FontFallbackScheduler,
  TextMetricsLike,
} from "../src/lib/fonts";

function context(isInstalled: boolean): CanvasMeasureContext {
  const context = {
    font: "",
    measureText(text: string): TextMetricsLike {
      const base: TextMetricsLike = {
        width: text.length * 10,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
        fontBoundingBoxAscent: 12,
        fontBoundingBoxDescent: 3,
      };
      const probesFamily = context.font.includes(JSON.stringify(FONT_FAMILY));
      return isInstalled && probesFamily
        ? {
            ...base,
            width: base.width + 1,
            actualBoundingBoxAscent: 11,
            actualBoundingBoxDescent: 3,
            fontBoundingBoxAscent: 13,
            fontBoundingBoxDescent: 4,
          }
        : base;
    },
  };
  return context;
}

interface FakeLink {
  rel: string;
  href: string;
  referrerPolicy: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function fakeDocument(loadReturnsFaces = true) {
  const links: FakeLink[] = [];
  const loadCalls: { fontSpec: string; sample: string }[] = [];
  const document = {
    documentElement: { dataset: {} as Record<string, string> },
    head: {
      appendChild(link: FakeLink): void {
        links.push(link);
      },
    },
    createElement(tag: string): FakeLink {
      if (tag !== "link") {
        throw new Error(`unexpected createElement(${tag})`);
      }
      return {
        rel: "",
        href: "",
        referrerPolicy: "",
        onload: null,
        onerror: null,
      };
    },
    fonts: {
      async load(fontSpec: string, sample: string) {
        loadCalls.push({ fontSpec, sample });
        return loadReturnsFaces ? [{}] : [];
      },
    },
  } as unknown as Document;
  return { document, links, loadCalls };
}

function status(document: Document): string | undefined {
  return (document.documentElement.dataset as Record<string, string>)[
    FONT_STATUS_ATTRIBUTE
  ];
}

function logger() {
  const lines: { level: "info" | "warn"; text: string }[] = [];
  return {
    lines,
    logger: {
      info: (...args: unknown[]) => lines.push({ level: "info", text: args.join(" ") }),
      warn: (...args: unknown[]) => lines.push({ level: "warn", text: args.join(" ") }),
    },
  };
}

function scheduler() {
  const handlers: (() => void)[] = [];
  const cleared: unknown[] = [];
  let next = 0;
  const value: FontFallbackScheduler = {
    setTimeout(handler) {
      handlers.push(handler);
      next += 1;
      return next;
    },
    clearTimeout(handle) {
      cleared.push(handle);
    },
  };
  return { scheduler: value, handlers, cleared };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("detectFamily", () => {
  test("a family with different metrics is present", () => {
    expect(detectFamily(context(true), FONT_FAMILY)).toBe(true);
  });

  test("a family that measures exactly like every baseline is absent", () => {
    expect(detectFamily(context(false), FONT_FAMILY)).toBe(false);
  });

  test("fontFamilyExists reads the client canvas, not the server", () => {
    const document = {
      createElement: () => ({ getContext: () => context(true) }),
    } as unknown as Document;
    expect(fontFamilyExists(document, FONT_FAMILY)).toBe(true);

    const blind = {
      createElement: () => ({ getContext: () => null }),
    } as unknown as Document;
    expect(fontFamilyExists(blind, FONT_FAMILY)).toBe(false);
  });
});

describe("installFontFallback", () => {
  test("an installed family starts zero requests", () => {
    const { document, links } = fakeDocument();
    const install = createFontFallback({
      document,
      familyExists: () => true,
      load: async () => undefined,
    });

    expect(install()).toBe(true);
    expect(links).toHaveLength(0);
    expect(status(document)).toBe("system");
  });

  test("a missing family appends the CDN stylesheet with no referrer", async () => {
    const { document, links, loadCalls } = fakeDocument();
    const log = logger();
    const time = scheduler();
    const install = createFontFallback({
      document,
      familyExists: () => false,
      scheduler: time.scheduler,
      logger: log.logger,
    });

    install();

    expect(links).toHaveLength(1);
    const link = links[0]!;
    expect(link.rel).toBe("stylesheet");
    expect(link.href).toBe(FONT_CDN_STYLESHEET);
    expect(link.referrerPolicy).toBe("no-referrer");

    link.onload?.();
    await flush();

    expect(loadCalls).toEqual([
      { fontSpec: `13px "${FONT_FAMILY}"`, sample: FONT_LOAD_SAMPLE },
    ]);
    expect(status(document)).toBe("cdn");
    expect(time.cleared).toHaveLength(1);
    expect(log.lines.some((line) => line.level === "info")).toBe(true);
  });

  test("a stylesheet error keeps the fallback and warns", () => {
    const { document, links } = fakeDocument();
    const log = logger();
    const install = createFontFallback({
      document,
      familyExists: () => false,
      scheduler: scheduler().scheduler,
      logger: log.logger,
    });

    install();
    links[0]!.onerror?.();

    expect(status(document)).toBeUndefined();
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]!.level).toBe("warn");
  });

  test("a stylesheet without matching faces keeps the fallback", async () => {
    const { document, links } = fakeDocument(false);
    const log = logger();
    const install = createFontFallback({
      document,
      familyExists: () => false,
      scheduler: scheduler().scheduler,
      logger: log.logger,
    });

    install();
    links[0]!.onload?.();
    await flush();

    expect(status(document)).toBeUndefined();
    expect(log.lines.at(-1)?.level).toBe("warn");
  });

  test("a slow CDN warns once and a later success still marks cdn", async () => {
    const { document, links } = fakeDocument();
    const log = logger();
    const time = scheduler();
    const install = createFontFallback({
      document,
      familyExists: () => false,
      scheduler: time.scheduler,
      logger: log.logger,
      timeoutMs: 10,
    });

    install();
    time.handlers[0]?.();
    expect(status(document)).toBeUndefined();
    expect(log.lines.at(-1)?.level).toBe("warn");

    links[0]!.onload?.();
    await flush();
    expect(status(document)).toBe("cdn");
  });

  test("a detection failure warns but never breaks the caller", () => {
    const { document, links } = fakeDocument();
    const log = logger();
    const install = createFontFallback({
      document,
      familyExists: () => {
        throw new Error("canvas unavailable");
      },
      scheduler: scheduler().scheduler,
      logger: log.logger,
    });

    expect(install()).toBe(true);
    expect(links).toHaveLength(0);
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]!.level).toBe("warn");
  });

  test("calling twice appends one stylesheet", () => {
    const { document, links } = fakeDocument();
    const install = createFontFallback({
      document,
      familyExists: () => false,
      scheduler: scheduler().scheduler,
      logger: logger().logger,
    });

    expect(install()).toBe(true);
    expect(install()).toBe(false);
    expect(links).toHaveLength(1);
  });
});
