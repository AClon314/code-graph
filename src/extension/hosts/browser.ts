import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";
import { requestCbm } from "../../lib/cbm-request";
import { JumpClient } from "../../lib/jump/client";
import { NODE_RENDERER_FILE } from "../../lib/node-renderer";
import { TEAM_CONFIG_FILE, loadProjectConfig } from "../../lib/config";

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
      let configuredRenderer = env.VITE_NODE_RENDERER;
      if (!configuredRenderer) {
        try {
          const loaded = await loadProjectConfig("/", async (path) => {
            const response = await fetch(
              `/api/config-file?path=${encodeURIComponent(path.replace(/^\/+/, ""))}&optional=1`,
              { cache: "no-store" },
            );
            return response.ok ? response.text() : null;
          });
          configuredRenderer = loaded.config.node?.renderer?.trim();
        } catch {
          // Static hosting may not expose the config endpoint.
        }
      }
      const nodeRendererPath = configuredRenderer || NODE_RENDERER_FILE;
      const nodeRendererUrl =
        `/api/config-file?path=${encodeURIComponent(nodeRendererPath)}`;
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
        nodeRendererPath,
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
