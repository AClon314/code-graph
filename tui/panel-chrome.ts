/** Pure toolbar/help presentation shared by the Fresh graph panel. */
export type ToolbarAction = "help" | "entry" | "reload" | "close";

export const HEADER_ROWS = 2;

const TOOLBAR_ACTIONS: Array<{ label: string; action: ToolbarAction }> = [
  { label: "Help", action: "help" },
  { label: "Entry", action: "entry" },
  { label: "Reload", action: "reload" },
  { label: "Close", action: "close" },
];

export const HELP_LINES = [
  "Code Graph — keys",
  "",
  "  ? / [Help]    toggle this help",
  "  e / [Entry]   pick a project root",
  "  ↑ / ↓         move in the root picker",
  "  Enter         accept the picked root",
  "  c             custom root (free-form qn)",
  "  Esc           cancel the root picker",
  "  r / [Reload]  reload config and graph",
  "  o / Enter     open the selected node",
  "  q / [Close]   close this panel",
  "",
  "Mouse",
  "  click         select a node",
  "  double-click  open the node's file",
  "",
  "The toolbar labels above are clickable.",
];

function actionLabel(action: ToolbarAction, helpVisible: boolean): string {
  if (action === "help" && helpVisible) return "[G] Graph";
  const label = TOOLBAR_ACTIONS.find((item) => item.action === action)!.label;
  return `[${label[0]}] ${label}`;
}

export function toolbarLabel(helpVisible: boolean): string {
  return TOOLBAR_ACTIONS.map((item) => actionLabel(item.action, helpVisible)).join("  ");
}

export function headerLines(helpVisible: boolean): string[] {
  return [toolbarLabel(helpVisible), ""];
}

export function headerEntries(helpVisible: boolean): Record<string, unknown>[] {
  return [
    {
      text: toolbarLabel(helpVisible),
      style: { fg: [137, 180, 250], bold: true },
    },
    { text: "\n\n" },
  ];
}

export function toolbarActionAt(helpVisible: boolean, column: number): ToolbarAction | null {
  let start = 0;
  for (const item of TOOLBAR_ACTIONS) {
    const label = actionLabel(item.action, helpVisible);
    if (column >= start && column < start + label.length) return item.action;
    start += label.length + 2;
  }
  return null;
}
