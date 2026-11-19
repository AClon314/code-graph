import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";
import { requestCbm } from "../../lib/cbm-request";
import { NODE_RENDERER_FILE } from "../../lib/node-renderer";
import { TEAM_CONFIG_FILE } from "../../lib/config";

interface FreshEditor {
  openFile(path: string, line: number, column: number): void;
  readFile?(path: string): string | null;
  setStatus(message: string): void;
}

declare function getEditor(): FreshEditor;

type FreshGlobals = {
  CODE_NAV_ROOT?: string;
  CODE_NAV_BACKEND?: "cbm" | "scip";
  CODE_NAV_PROJECT?: string;
  CODE_NAV_SYMBOL_ENTRY?: string;
  CODE_NAV_SOURCE?: ExtensionConfig["source"];
  CODE_NAV_CONFIG?: string;
  CODE_NAV_NODE_RENDERER?: string;
};

/**
 * Fresh/QuickJS implementation. The plugin is bundled to a single file; this
 * module is the only host included in that bundle.
 */
export function createExtensionApi(): ExtensionApi {
  return {
    runtime: "fresh",
    async getConfig(requestedBackend?: ExtensionConfig["backend"]) {
      const globals = globalThis as unknown as FreshGlobals;
      const nodeRendererPath =
        globals.CODE_NAV_NODE_RENDERER ?? NODE_RENDERER_FILE;
      return {
        backend: requestedBackend ?? globals.CODE_NAV_BACKEND ?? DEFAULT_CONFIG.backend,
        source: globals.CODE_NAV_SOURCE ?? DEFAULT_CONFIG.source,
        cbmBaseUrl: DEFAULT_CONFIG.cbmBaseUrl,
        project: globals.CODE_NAV_PROJECT ?? DEFAULT_CONFIG.project,
        symbolEntry: globals.CODE_NAV_SYMBOL_ENTRY ?? DEFAULT_CONFIG.symbolEntry,
        workspaceRoot: globals.CODE_NAV_ROOT ?? "",
        configPath: globals.CODE_NAV_CONFIG ?? TEAM_CONFIG_FILE,
        nodeRendererPath,
        nodeRendererUrl: "",
      };
    },
    async fetchCbm(request) {
      return requestCbm(DEFAULT_CONFIG.cbmBaseUrl, request);
    },
    async openSettings(query) {
      getEditor().setStatus("Code Graph: configure " + query + " in your settings");
    },
    async openLocation(location) {
      const target = resolvePath(location);
      getEditor().openFile(
        target,
        Math.max(1, Math.trunc(location.line ?? 1)),
        Math.max(1, Math.trunc(location.column ?? 1)),
      );
    },
    setStatus(message) {
      getEditor().setStatus(message);
    },
  };
}

function resolvePath(location: SourceLocation): string {
  if (location.path.startsWith("/")) return location.path;
  const globals = globalThis as unknown as FreshGlobals;
  const root = globals.CODE_NAV_ROOT;
  if (!root) return location.path;
  return `${root.replace(/\/+$/, "")}/${location.path}`;
}
