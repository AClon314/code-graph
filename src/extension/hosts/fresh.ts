import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";

interface FreshEditor {
  openFile(path: string, line: number, column: number): void;
  setStatus(message: string): void;
}

declare function getEditor(): FreshEditor;

type FreshGlobals = {
  CODE_NAV_ROOT?: string;
  CODE_NAV_BACKEND?: "cbm" | "scip";
  CODE_NAV_PROJECT?: string;
  CODE_NAV_SYMBOL?: string;
  CODE_NAV_CBM?: string;
  CODE_NAV_SOURCE?: ExtensionConfig["source"];
};

/**
 * Fresh/QuickJS implementation. The plugin is bundled to a single file; this
 * module is the only host included in that bundle.
 */
export function createExtensionApi(): ExtensionApi {
  return {
    runtime: "fresh",
    async getConfig() {
      const globals = globalThis as unknown as FreshGlobals;
      return {
        backend: globals.CODE_NAV_BACKEND ?? DEFAULT_CONFIG.backend,
        source: globals.CODE_NAV_SOURCE ?? DEFAULT_CONFIG.source,
        cbmBaseUrl: globals.CODE_NAV_CBM ?? DEFAULT_CONFIG.cbmBaseUrl,
        project: globals.CODE_NAV_PROJECT ?? DEFAULT_CONFIG.project,
        symbol: globals.CODE_NAV_SYMBOL ?? DEFAULT_CONFIG.symbol,
      };
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
