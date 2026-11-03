import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type CbmHttpRequest,
  type CbmHttpResponse,
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
        symbolEntry: env.VITE_SYMBOL_ENTRY ?? DEFAULT_CONFIG.symbolEntry,
      } satisfies ExtensionConfig;
    },
    async fetchCbm(request: CbmHttpRequest): Promise<CbmHttpResponse> {
      const base = import.meta.env.VITE_CBM_BASE ?? DEFAULT_CONFIG.cbmBaseUrl;
      const url = new URL(request.path, base);
      for (const [key, value] of Object.entries(request.query ?? {})) {
        url.searchParams.set(key, value);
      }
      const response = await fetch(url, {
        method: request.method ?? "GET",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: request.body,
      });
      return { status: response.status, body: await response.text() };
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
