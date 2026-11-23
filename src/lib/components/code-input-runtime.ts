import { EditorView, tooltips } from "@codemirror/view";

/**
 * Shared by every CodeInput instance. EditorView.theme returns a class-bearing
 * extension; creating it once avoids one theme class/style per field.
 */
export const codeInputTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflowX: "auto",
    overflowY: "hidden",
    fontFamily: "inherit",
    lineHeight: "inherit",
    touchAction: "pan-x",
  },
  ".cm-content": {
    minHeight: "1lh",
    padding: "0",
    whiteSpace: "pre",
    caretColor: "currentColor",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-placeholder": {
    color: "var(--vscode-input-placeholderForeground, var(--cg-muted))",
  },
});

export function visibleTooltipSpace() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      right: vv.offsetLeft + vv.width,
      bottom: vv.offsetTop + vv.height,
    };
  }
  const root = document.documentElement;
  return {
    top: 0,
    left: 0,
    right: root.clientWidth,
    bottom: root.clientHeight,
  };
}

/** Shared tooltip configuration. The view plugin is still per editor. */
export const codeInputTooltips = tooltips({
  tooltipSpace: visibleTooltipSpace,
});

const viewportSubscribers = new Set<() => void>();
let viewportListening = false;

function syncVisualWidth(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (vv) {
    root.style.setProperty("--code-input-visual-width", `${vv.width}px`);
    // Shrink the app to the visible viewport so the software keyboard cannot
    // cover the operation bar. Use a percentage because `.app` is zoomed.
    const ratio = window.innerHeight > 0 ? vv.height / window.innerHeight : 1;
    root.style.setProperty(
      "--code-graph-visual-height",
      `${Math.max(0.25, Math.min(1, ratio)) * 100}%`,
    );
  } else {
    root.style.removeProperty("--code-input-visual-width");
    root.style.removeProperty("--code-graph-visual-height");
  }
}

function notifyViewport(): void {
  syncVisualWidth();
  for (const subscriber of viewportSubscribers) subscriber();
}

function startViewportListeners(): void {
  if (viewportListening) return;
  viewportListening = true;
  window.addEventListener("resize", notifyViewport);
  window.addEventListener("scroll", notifyViewport, true);
  const vv = window.visualViewport;
  vv?.addEventListener("resize", notifyViewport);
  vv?.addEventListener("scroll", notifyViewport);
  syncVisualWidth();
}

function stopViewportListeners(): void {
  if (!viewportListening) return;
  viewportListening = false;
  window.removeEventListener("resize", notifyViewport);
  window.removeEventListener("scroll", notifyViewport, true);
  const vv = window.visualViewport;
  vv?.removeEventListener("resize", notifyViewport);
  vv?.removeEventListener("scroll", notifyViewport);
}

/**
 * One set of window/visualViewport listeners for all CodeInput instances.
 * Returns an unsubscribe function.
 */
export function subscribeViewport(subscriber: () => void): () => void {
  viewportSubscribers.add(subscriber);
  startViewportListeners();
  return () => {
    viewportSubscribers.delete(subscriber);
    if (!viewportSubscribers.size) {
      stopViewportListeners();
      document.documentElement.style.removeProperty("--code-input-visual-width");
      document.documentElement.style.removeProperty("--code-graph-visual-height");
    }
  };
}
