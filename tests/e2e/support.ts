import { expect, test, type Page, type TestInfo } from "@playwright/test";

export interface PageIssues {
  errors: string[];
  warnings: string[];
}

const DEFAULT_IGNORED_CONSOLE = [
  /favicon\.ico/i,
  // code-server probes marketplace/telemetry endpoints in its own chrome;
  // they are unrelated to the Code Graph webview.
  /marketplace\.visualstudio\.com/i,
  /telemetry/i,
  // code-server ships without the optional vsda WebAssembly probe.
  /\/static\/node_modules\/vsda\//i,
  /web worker extension host is started in a same-origin iframe/i,
  /allow-scripts and allow-same-origin/i,
];

/**
 * Capture browser runtime problems. Console warnings are reported as
 * annotations (visible in the HTML report) but never fail the test; console
 * errors and uncaught page errors do.
 */
export function watchPage(
  page: Page,
  testInfo: TestInfo,
  options: { ignoreConsole?: RegExp[] } = {},
): PageIssues {
  const issues: PageIssues = { errors: [], warnings: [] };
  const ignored = [...DEFAULT_IGNORED_CONSOLE, ...(options.ignoreConsole ?? [])];

  page.on("console", (message) => {
    const type = message.type();
    if (type !== "error" && type !== "warning") return;
    const text = message.text();
    const source = message.location().url;
    const detail = source ? `${text} @ ${source}` : text;
    if (ignored.some((pattern) => pattern.test(detail))) return;
    if (type === "error") issues.errors.push(detail);
    else issues.warnings.push(detail);
  });
  page.on("pageerror", (error) => {
    issues.errors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "request failed";
    if (reason.includes("ERR_ABORTED")) return;
    const text = `${reason} ${request.url()}`;
    if (ignored.some((pattern) => pattern.test(text))) return;
    issues.warnings.push(`requestfailed: ${text}`);
  });

  testInfo.annotations.push({
    type: "console",
    description: "warnings are recorded below; only errors fail the test",
  });
  return issues;
}

export function finishPageIssues(issues: PageIssues, testInfo: TestInfo): void {
  if (issues.warnings.length > 0) {
    testInfo.annotations.push({
      type: "console-warning",
      description: `${issues.warnings.length} warning(s); first: ${issues.warnings[0]}`,
    });
    console.warn(`[e2e] ${issues.warnings.length} browser warning(s):`);
    for (const warning of issues.warnings.slice(0, 5)) console.warn(`  - ${warning}`);
  }
  expect(issues.errors, "browser console/page errors").toEqual([]);
}

/**
 * Run a journey step as a Playwright step.
 *
 * Step timings and browser performance metrics come from
 * playwright-performance-reporter; this wrapper only keeps the product rule
 * that a step over its wall-clock budget is a warning, not a failure.
 */
export async function timed<T>(
  testInfo: TestInfo,
  label: string,
  budgetMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await test.step(label, action);
  } finally {
    const elapsed = Math.round(performance.now() - started);
    if (elapsed > budgetMs) {
      console.warn(`[e2e slow] ${label}: ${elapsed}ms > ${budgetMs}ms budget`);
      testInfo.annotations.push({
        type: "slow",
        description: `${label}: ${elapsed}ms > ${budgetMs}ms`,
      });
    }
  }
}
