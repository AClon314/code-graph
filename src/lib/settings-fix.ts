import type { GraphBackend } from "../extension/api";

export interface SettingsFix {
  label: string;
  /** Empty for actions that do not open the settings UI. */
  query: string;
  action?: "settings" | "restart-cbm";
}

export function cbmUrlFix(): SettingsFix {
  return { label: "Open cbm URL setting", query: "codeGraph.cbmBaseUrl" };
}

export function restartCbmFix(): SettingsFix {
  return { label: "Restart cbm-http service?", query: "", action: "restart-cbm" };
}

/** Pick the settings page or recovery action that can fix a cbm/backend error. */
export function fixFor(value: unknown, backend: GraphBackend): SettingsFix {
  const text = (value instanceof Error ? value.message : String(value)).toLowerCase();
  // A 500 or transport failure means the listener is unhealthy; changing a
  // setting or symbol name will not help, but restarting it usually does.
  if (
    /\bcbm \/api\/[^\s]*\s+5\d\d\b/.test(text) ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("econnrefused") ||
    text.includes("connection refused") ||
    text.includes("request timed out")
  ) {
    return restartCbmFix();
  }
  if (
    text.includes("project not found") ||
    text.includes("unknown project") ||
    text.includes("no such project")
  ) {
    return {
      label: "Open project setting",
      query: backend === "scip" ? "codeGraph.scipProject" : "codeGraph.cbmProject",
      action: "settings",
    };
  }
  if (text.includes("symbol") || text.includes("entry")) {
    return { label: "Open symbol entry setting", query: "codeGraph.symbolEntry", action: "settings" };
  }
  return { ...cbmUrlFix(), action: "settings" };
}
