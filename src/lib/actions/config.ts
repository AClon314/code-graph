import type { ExtensionApi, Runtime } from "../../extension/api";
import type { StatusState } from "../state/code-graph";

/** Open a workspace config file in the host editor, or the web config route. */
export function openConfigPath(
  path: string,
  runtime: Runtime,
  api: Pick<ExtensionApi, "openLocation">,
  status: StatusState,
): void {
  if (!path) return;
  if (runtime === "browser") {
    const url = new URL("/config", window.location.origin);
    url.searchParams.set("path", path);
    const theme = document.documentElement.dataset.codeGraphTheme;
    if (theme) url.searchParams.set("theme", theme);
    const scale = document.documentElement.style.getPropertyValue("--code-graph-scale");
    if (scale) url.searchParams.set("scale", scale);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    return;
  }
  void api.openLocation({ path, line: 1, column: 1 }).catch((cause) => {
    status.error = `Could not open ${path}: ${cause instanceof Error ? cause.message : String(cause)}`;
  });
}
