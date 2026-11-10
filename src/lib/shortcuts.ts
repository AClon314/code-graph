export type ShortcutAction =
  | "search"
  | "reload"
  | "toggle-details"
  | "toggle-setup"
  | "fit"
  | "close-setup"
  | "close-details";

export interface ShortcutContext {
  setupOpen: boolean;
  inspectorOpen: boolean;
}

/** Structural subset of KeyboardEvent, so the resolver stays unit-testable. */
export interface ShortcutEvent {
  key: string;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  composedPath?: () => readonly unknown[];
}

const TYPING_SELECTOR = "input, textarea, select, [contenteditable='true']";
const COMPONENT_SELECTOR = "vscode-textfield, vscode-single-select";

function isTypingElement(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const element = node as { matches?: (selector: string) => boolean };
  if (typeof element.matches !== "function") return false;
  return element.matches(TYPING_SELECTOR) || element.matches(COMPONENT_SELECTOR);
}

/** True when focus is inside a native or VS Code form control. */
export function isTypingTarget(path: readonly unknown[]): boolean {
  return path.some(isTypingElement);
}

/**
 * Map a keypress to one app action. Escape closes panels even while typing;
 * other shortcuts are ignored inside inputs and modifier combinations.
 */
export function resolveShortcut(
  event: ShortcutEvent,
  context: ShortcutContext,
): ShortcutAction | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.repeat && event.key !== "Escape") return null;

  if (event.key === "Escape") {
    if (context.setupOpen) return "close-setup";
    if (context.inspectorOpen) return "close-details";
    return null;
  }

  if (isTypingTarget(event.composedPath?.() ?? [])) return null;

  switch (event.key.toLowerCase()) {
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
