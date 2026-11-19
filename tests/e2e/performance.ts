import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  nativeChromiumObservers,
  nativePresenters,
  type ChromiumMetricObserver,
  type Options,
} from "playwright-performance-reporter";

/** CDP port used by the performance reporter; override when it is occupied. */
export const performancePort = Number(
  process.env.CODE_GRAPH_PERF_PORT || "9222",
);

const outputDir = "test-results/performance";
mkdirSync(outputDir, { recursive: true });

// CPU traces are large and slow; opt in when diagnosing a regression:
//   CODE_GRAPH_PERF_TRACE=1 bun run test:web
const captureTrace = process.env.CODE_GRAPH_PERF_TRACE === "1";

const stepMetrics: ChromiumMetricObserver[] = [
  new nativeChromiumObservers.cpuProfiler(),
  new nativeChromiumObservers.longTasks(),
  new nativeChromiumObservers.longAnimationFrames(),
  new nativeChromiumObservers.webVitals(),
  new nativeChromiumObservers.navigationTiming(),
  new nativeChromiumObservers.allPerformanceMetrics(),
];
if (captureTrace) {
  stepMetrics.push(
    new nativeChromiumObservers.traceCapture({
      outputDir: join(outputDir, "traces"),
      filePrefix: "web",
    }),
  );
}

/**
 * Browser performance collection for the web e2e run. Artifacts are retained
 * even when a test fails so the failing journey can be inspected.
 */
export const performanceOptions: Options = {
  deleteOnFailure: false,
  presenters: [
    new nativePresenters.jsonAggregatePresenter({
      outputDir,
      outputFile: "web.json",
      pretty: true,
    }),
    new nativePresenters.chartPresenter({
      outputDir,
      outputFile: "web.html",
    }),
  ],
  browsers: {
    chromium: {
      onTest: {
        metrics: [new nativeChromiumObservers.allPerformanceMetrics()],
      },
      onTestStep: { metrics: stepMetrics },
      sampling: {
        metrics: [
          {
            samplingTimeoutInMilliseconds: 1_000,
            metric: new nativeChromiumObservers.usedJsHeapSize(),
          },
        ],
      },
    },
  },
};
