import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";
import { JumpClient } from "../../lib/jump/client";

/**
 * Standalone `vite dev` host. It keeps the previous behaviour: jump through
 * the local JSON-RPC bridge instead of a real editor API.
 */
export function createExtensionApi(): ExtensionApi {
  const jump = new JumpClient();
  return {
    runtime: "browser",
    async getConfig() {
      const env = import.meta.env;
      const source = env.VITE_SOURCE === "cbm" ? "cbm" : DEFAULT_CONFIG.source;
      return {
        backend: env.VITE_BACKEND === "scip" ? "scip" : DEFAULT_CONFIG.backend,
        source,
        cbmBaseUrl: env.VITE_CBM_BASE ?? DEFAULT_CONFIG.cbmBaseUrl,
        project: env.VITE_PROJECT ?? DEFAULT_CONFIG.project,
        symbol: env.VITE_SYMBOL ?? DEFAULT_CONFIG.symbol,
      } satisfies ExtensionConfig;
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
