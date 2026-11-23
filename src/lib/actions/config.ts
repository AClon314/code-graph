import type { ExtensionApi, Runtime } from "../../extension/api";
import type { StatusState } from "../state/code-graph";
import { toNativePath } from "../symbol-path";

/** Open a workspace config file in the host editor, or the web input route. */
export function openConfigPath(
  path: string,
  runtime: Runtime,
  api: Pick<ExtensionApi, "openLocation">,
  status: StatusState,
  global = false,
): void {
  if (!path) return;
  if (runtime === "browser") {
    const url = new URL("/input", window.location.origin);
    const globalPath =
      typeof __CODE_GRAPH_GLOBAL_CONFIG__ === "string" &&
      path.startsWith(`${__CODE_GRAPH_GLOBAL_CONFIG__}/`);
    if (global || globalPath) {
      url.searchParams.set("global", "1");
      url.searchParams.set("path", path.split("/").at(-1) || path);
    } else {
      url.searchParams.set("path", path.replace(/^\/+/, ""));
    }
    const theme = document.documentElement.dataset.codeGraphTheme;
    if (theme) url.searchParams.set("theme", theme);
    const scale = getComputedStyle(document.documentElement)
      .getPropertyValue("--code-graph-scale")
      .trim();
    if (scale) url.searchParams.set("scale", scale);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    return;
  }
  void api.openLocation({ path: toNativePath(path), line: 1, column: 1 }).catch((cause) => {
    status.error = `Could not open ${path}: ${cause instanceof Error ? cause.message : String(cause)}`;
  });
}
