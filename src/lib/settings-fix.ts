import type { GraphBackend } from "../extension/api";

export interface SettingsFix {
  label: string;
  query: string;
}

export function cbmUrlFix(): SettingsFix {
  return { label: "Open cbm URL setting", query: "codeGraph.cbmBaseUrl" };
}

/** Pick the settings page that can fix a cbm/backend error. */
export function fixFor(value: unknown, backend: GraphBackend): SettingsFix {
  const text = (value instanceof Error ? value.message : String(value)).toLowerCase();
  if (
    text.includes("project not found") ||
    text.includes("unknown project") ||
    text.includes("no such project")
  ) {
    return {
      label: "Open project setting",
      query: backend === "scip" ? "codeGraph.scipProject" : "codeGraph.cbmProject",
    };
  }
  if (text.includes("symbol") || text.includes("entry")) {
    return { label: "Open symbol entry setting", query: "codeGraph.symbolEntry" };
  }
  return cbmUrlFix();
}
