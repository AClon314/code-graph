/**
 * Maple Mono NF CN: use the client's installed family, otherwise the CDN copy.
 *
 * "Installed" means the machine running the browser, not the machine serving
 * the page. The GUI binds to 0.0.0.0 and is often opened from another host, so
 * asking the server what fonts it has would answer the wrong question. The
 * check below therefore runs entirely in the client.
 *
 * The CSS stack already names the family first; a missing family falls through
 * to the local stack without an error. This module only decides whether the
 * CDN stylesheet is worth requesting.
 */

export const FONT_FAMILY = "Maple Mono NF CN";

/**
 * `result.css` holds 191 `@font-face` rules split by `unicode-range`; the
 * browser downloads only the blocks the page actually uses. The stylesheet is
 * about 48 KB gzip, the ASCII blocks about 61 KB.
 */
export const FONT_CDN_STYLESHEET =
  "https://fontsapi.zeoseven.com/442/main/result.css";

/**
 * Text used to pull the blocks the GUI needs before the font swaps in.
 *
 * The box-drawing/arrow/marker characters are part of the orchgraph canvas.
 * They must be in this sample: if their `@font-face` blocks are still missing
 * when the `<pre>` is measured, the browser falls back to a system font whose
 * advance is not one cell and the character grid drifts. U+25D0 (`◐`) is
 * deliberately absent; the CDN font has no block for it (see terminal.ts).
 *
 * CJK is not sampled here. It is 2 cells wide in Maple (the same width the
 * character canvas assumes), and a node label that actually contains CJK pulls
 * its block on demand. This keeps the ASCII + art path at seven blocks.
 */
export const FONT_LOAD_SAMPLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  "{}[]()<>=+-*/\\|&^%$#@!?.,:;'\"`~_ " +
  "○●◆✓✕◌─│╭╮╰╯├┤┬┴┼┊┈▼▲▶◀";

/** `data-font-maple` on `<html>`: `system`, `cdn`, or absent while trying. */
export const FONT_STATUS_ATTRIBUTE = "fontMaple";

export const FONT_CDN_TIMEOUT_MS = 3000;

const BASELINES = ["monospace", "serif", "sans-serif"] as const;

/*
 * The smallest set that survived the ablation in the fontTest reference
 * implementation:
 * - without fontBoundingBox* the CJK probes are almost never detected;
 * - without actualBoundingBox* full-width CJK glyphs can still measure the
 *   same width as the baseline;
 * - with only sans-serif, Arial/Helvetica-like families look like the
 *   baseline they are aliased to.
 */
const PROBES = ["mmmmmmmmmmlliWWW@0O1Il意", "中文字体测试国国国體繁體"] as const;

const METRIC_KEYS = [
  "width",
  "actualBoundingBoxAscent",
  "actualBoundingBoxDescent",
  "fontBoundingBoxAscent",
  "fontBoundingBoxDescent",
] as const;

const METRIC_EPSILON = 0.05;

export interface TextMetricsLike {
  width: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
}

export interface CanvasMeasureContext {
  font: string;
  measureText(text: string): TextMetricsLike;
}

export interface FontFallbackScheduler {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface FontFallbackLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export interface FontFallbackOptions {
  document?: Document;
  familyExists?: (doc: Document, family: string) => boolean;
  load?: (doc: Document, fontSpec: string, sample: string) => Promise<void>;
  timeoutMs?: number;
  scheduler?: FontFallbackScheduler;
  logger?: FontFallbackLogger;
}

const systemScheduler: FontFallbackScheduler = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function metricsFor(
  context: CanvasMeasureContext,
  fontSpec: string,
  text: string,
): number[] {
  context.font = fontSpec;
  const metrics = context.measureText(text);
  return METRIC_KEYS.map((key) => Number(metrics[key] ?? 0));
}

function metricsDiffer(a: readonly number[], b: readonly number[]): boolean {
  return a.some((value, index) => Math.abs(value - (b[index] ?? 0)) > METRIC_EPSILON);
}

/**
 * Compare the family against the baseline for every probe. A missing family
 * falls back to the baseline in full, so every metric stays identical.
 *
 * Do not use `document.fonts.check()` for this: for a system-installed family
 * it often returns true even when no matching face can be found, which would
 * wrongly mark the family as present and skip the CDN forever.
 */
export function detectFamily(
  context: CanvasMeasureContext,
  family: string,
): boolean {
  const quoted = JSON.stringify(family);
  return BASELINES.some((baseline) =>
    PROBES.some((probe) => {
      const withFamily = metricsFor(
        context,
        `72px ${quoted}, ${baseline}`,
        probe,
      );
      const withBaseline = metricsFor(context, `72px ${baseline}`, probe);
      return metricsDiffer(withFamily, withBaseline);
    }),
  );
}

/** Client-side check: does this browser's machine provide the family? */
export function fontFamilyExists(doc: Document, family: string): boolean {
  const canvas = doc.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) {
    // No canvas means no proof either way; let the CDN path decide.
    return false;
  }
  return detectFamily(context, family);
}

async function loadFontFromDocument(
  doc: Document,
  fontSpec: string,
  sample: string,
): Promise<void> {
  const faces = await doc.fonts.load(fontSpec, sample);
  if (faces.length === 0) {
    throw new Error(`no @font-face matched ${fontSpec}`);
  }
}

function start(options: FontFallbackOptions): void {
  const log = options.logger ?? console;
  try {
    startUnsafe(options, log);
  } catch (error) {
    // A font is an enhancement; it must never keep the application from
    // mounting. Detection and DOM injection both happen here.
    log.warn(
      `[fonts] could not start the ${FONT_FAMILY} fallback; keeping the local stack`,
      error,
    );
  }
}

function startUnsafe(options: FontFallbackOptions, log: FontFallbackLogger): void {
  const doc = options.document ?? globalThis.document;
  if (doc === undefined) {
    return;
  }

  const familyExists = options.familyExists ?? fontFamilyExists;
  if (familyExists(doc, FONT_FAMILY)) {
    doc.documentElement.dataset[FONT_STATUS_ATTRIBUTE] = "system";
    return;
  }

  const timeoutMs = options.timeoutMs ?? FONT_CDN_TIMEOUT_MS;
  const scheduler = options.scheduler ?? systemScheduler;
  const load = options.load ?? loadFontFromDocument;
  const root = doc.documentElement;

  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_CDN_STYLESHEET;
  /*
   * Hard requirement, not a privacy nicety: the CDN answers an IP-literal
   * Referer (the GUI is usually opened at 127.0.0.1) or an empty User-Agent
   * with `204 No Content`. A 204 still looks like a successful stylesheet
   * load in devtools, but registers no faces, so the font would fall back
   * silently. `no-referrer` keeps the request valid from both localhost and
   * 127.0.0.1.
   */
  link.referrerPolicy = "no-referrer";

  let settled = false;
  const timer = scheduler.setTimeout(() => {
    if (settled || root.dataset[FONT_STATUS_ATTRIBUTE] === "cdn") {
      return;
    }
    log.warn(
      `[fonts] ${FONT_FAMILY} not ready after ${timeoutMs} ms; keeping the local stack`,
    );
  }, timeoutMs);

  const finish = (): void => {
    settled = true;
    scheduler.clearTimeout(timer);
  };

  link.onload = () => {
    void (async () => {
      try {
        await load(doc, `13px "${FONT_FAMILY}"`, FONT_LOAD_SAMPLE);
        finish();
        root.dataset[FONT_STATUS_ATTRIBUTE] = "cdn";
        log.info(`[fonts] loaded ${FONT_FAMILY} from the CDN`);
      } catch (error) {
        finish();
        log.warn(
          `[fonts] ${FONT_FAMILY} could not be loaded from the CDN; keeping the local stack`,
          error,
        );
      }
    })();
  };
  link.onerror = () => {
    finish();
    log.warn(
      `[fonts] ${FONT_FAMILY} CDN stylesheet failed; keeping the local stack`,
    );
  };

  doc.head.appendChild(link);
}

/**
 * Build an installer with its own "already started" guard. Tests use this to
 * get a fresh instance; the application uses the singleton below, which makes
 * a second call (hot reload, remount) a no-op.
 */
export function createFontFallback(
  options: FontFallbackOptions = {},
): () => boolean {
  let started = false;
  return () => {
    if (started) {
      return false;
    }
    started = true;
    start(options);
    return true;
  };
}

export const installFontFallback = createFontFallback();
