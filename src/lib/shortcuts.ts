export type ShortcutAction =
  | "search"
  | "reload"
  | "toggle-details"
  | "toggle-setup"
  | "fit"
  | "pan-up"
  | "pan-down"
  | "pan-left"
  | "pan-right"
  | "zoom-in"
  | "zoom-out"
  | "nav-callers"
  | "nav-callees"
  | "nav-prev-sibling"
  | "nav-next-sibling"
  | "copy-relative"
  | "copy-mode"
  | "copy-relative-or-svg"
  | "close-setup"
  | "close-details";

export interface ShortcutContext {
  setupOpen: boolean;
  inspectorOpen: boolean;
  /** A node is activated; wasd and copy shortcuts only apply in this state. */
  hasSelection: boolean;
}

/** Structural subset of KeyboardEvent, so the resolver stays unit-testable. */
export interface ShortcutEvent {
  key: string;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  composedPath?: () => readonly unknown[];
}

const TYPING_SELECTOR = "input, textarea, select, [contenteditable='true']";
const REPEATABLE = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "+",
  "=",
  "-",
  "_",
]);

function isTypingElement(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const element = node as { matches?: (selector: string) => boolean };
  if (typeof element.matches !== "function") return false;
  return element.matches(TYPING_SELECTOR);
}

/** True when focus is inside a native form control or editable content. */
export function isTypingTarget(path: readonly unknown[]): boolean {
  return path.some(isTypingElement);
}

/**
 * Map a keypress to one app action. Escape closes panels even while typing;
 * other shortcuts are ignored inside inputs, and unmodified keys retain the
 * panel/search shortcuts when no node is active.
 */
export function resolveShortcut(
  event: ShortcutEvent,
  context: ShortcutContext,
): ShortcutAction | null {
  if (event.defaultPrevented || event.altKey) return null;
  if (event.repeat && !REPEATABLE.has(event.key)) return null;

  if (event.key === "Escape") {
    if (context.setupOpen) return "close-setup";
    if (context.inspectorOpen) return "close-details";
    return null;
  }

  if (isTypingTarget(event.composedPath?.() ?? [])) return null;

  const key = event.key.toLowerCase();

  if (event.ctrlKey || event.metaKey) {
    if (key !== "c") return null;
    return event.shiftKey
      ? "copy-relative-or-svg"
      : context.hasSelection
        ? "copy-relative"
        : "copy-mode";
  }

  if (key === ".") return "fit";

  if (event.key.startsWith("Arrow")) {
    switch (event.key) {
      case "ArrowUp":
        return "pan-up";
      case "ArrowDown":
        return "pan-down";
      case "ArrowLeft":
        return "pan-left";
      case "ArrowRight":
        return "pan-right";
    }
  }

  if (key === "+" || key === "=") return "zoom-in";
  if (key === "-" || key === "_") return "zoom-out";

  if (context.hasSelection) {
    switch (key) {
      case "w":
        return "nav-callers";
      case "s":
        return "nav-callees";
      case "a":
        return "nav-prev-sibling";
      case "d":
        return "nav-next-sibling";
    }
  }

  switch (key) {
    case "/":
      return "search";
    case "r":
      return "reload";
    case "d":
      return "toggle-details";
    case "s":
      return "toggle-setup";
    case "f":
      return "fit";
    default:
      return null;
  }
}
