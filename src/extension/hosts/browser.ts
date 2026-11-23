import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";
import { requestCbm } from "../../lib/cbm-request";
import { JumpClient } from "../../lib/jump/client";
import {
  CSS_CONFIG_FILE,
  TEAM_CONFIG_FILE,
  configPaths,
  loadProjectConfig,
  resolveNodeRendererPath,
} from "../../lib/config";

/**
 * Standalone `vite dev` host. It keeps the previous behaviour: jump through
 * the local JSON-RPC bridge instead of a real editor API.
 */
export function createExtensionApi(): ExtensionApi {
  const jump = new JumpClient();
  return {
    runtime: "browser",
    async getConfig(requestedBackend?: ExtensionConfig["backend"]) {
      const env = import.meta.env;
      const source = env.VITE_SOURCE === "cbm" ? "cbm" : DEFAULT_CONFIG.source;
      const backend =
        requestedBackend ??
        (env.VITE_BACKEND === "scip" ? "scip" : DEFAULT_CONFIG.backend);
      const baseProject = env.VITE_PROJECT ?? DEFAULT_CONFIG.project;
      const project =
        backend === "scip"
          ? env.VITE_SCIP_PROJECT ??
            (baseProject.endsWith("-scip") ? baseProject : `${baseProject}-scip`)
          : baseProject;
      const globalRoot =
        typeof __CODE_GRAPH_GLOBAL_CONFIG__ === "string"
          ? __CODE_GRAPH_GLOBAL_CONFIG__
          : "__global";
      const readConfigFile = async (path: string): Promise<string | null> => {
        const globalFile = path.startsWith(`${globalRoot}/`);
        const relative = globalFile
          ? path.slice(globalRoot.length + 1)
          : path.replace(/^\/+/, "");
        const query = new URLSearchParams({ path: relative, optional: "1" });
        if (globalFile) query.set("global", "1");
        const response = await fetch(`/api/config-file?${query}`, {
          cache: "no-store",
        });
        return response.ok ? response.text() : null;
      };
      const loaded = await loadProjectConfig("/", readConfigFile, globalRoot).catch(
        () => ({ config: {}, sources: [], layers: [] }),
      );
      const nodeRendererPath = env.VITE_NODE_RENDERER || (await resolveNodeRendererPath("/", loaded, readConfigFile, globalRoot));
      const paths = configPaths("/", globalRoot);
      const fileUrl = (path: string, optional = false) => {
        const globalFile = path.startsWith(`${globalRoot}/`);
        const relative = globalFile ? path.slice(globalRoot.length + 1) : path.replace(/^\/+/, "");
        const query = new URLSearchParams({ path: relative });
        if (globalFile) query.set("global", "1");
        if (optional) query.set("optional", "1");
        return `/api/config-file?${query}`;
      };
      const nodeRendererUrl = fileUrl(nodeRendererPath);
      const styleUrls = [
        paths.global?.css,
        paths.project.css,
        paths.personal.css,
      ]
        .filter((path): path is string => Boolean(path))
        .map((path) => fileUrl(path, true));
      return {
        backend,
        source,
        cbmBaseUrl:
          env.VITE_CBM_BASE ??
          (typeof location === "undefined" ? DEFAULT_CONFIG.cbmBaseUrl : location.origin),
        project,
        symbolEntry: env.VITE_SYMBOL_ENTRY ?? DEFAULT_CONFIG.symbolEntry,
        workspaceRoot:
          env.VITE_WORKSPACE_ROOT ??
          (typeof __CODE_GRAPH_WORKSPACE_ROOT__ === "string"
            ? __CODE_GRAPH_WORKSPACE_ROOT__
            : ""),
        configPath: env.VITE_CONFIG_PATH ?? TEAM_CONFIG_FILE,
        cssPath: env.VITE_CSS_PATH ?? CSS_CONFIG_FILE,
        nodeRendererPath,
        globalConfigPath: paths.global?.jsonc ?? "",
        globalCssPath: paths.global?.css ?? "",
        globalRendererPath: paths.global?.renderer ?? "",
        styleUrls,
        nodeRendererUrl,
      } satisfies ExtensionConfig;
    },
    async fetchCbm(request) {
      const base =
        import.meta.env.VITE_CBM_BASE ??
        (typeof location === "undefined" ? DEFAULT_CONFIG.cbmBaseUrl : location.origin);
      return requestCbm(base, request);
    },
    async openSettings(query) {
      console.info(`[code-graph] open settings: ${query}`);
    },
    async restartCbm() {
      const response = await fetch("/__code-graph/restart-cbm", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`restart cbm-http: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      }
    },
    async openLocation(location: SourceLocation) {
      await jump.send({
        project: location.project ?? DEFAULT_CONFIG.project,
        path: location.path,
        line: Math.max(1, location.line ?? 1),
        column: location.column,
        symbol: location.symbol,
        source: "gui",
      });
    },
    setStatus(message) {
      console.info(`[code-graph] ${message}`);
    },
  };
}
