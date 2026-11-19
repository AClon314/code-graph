/**
 * The only editor-facing surface the GUI knows about.
 *
 * The same interface is implemented for VS Code, Fresh, the VS Code webview
 * (a postMessage proxy), and the standalone browser dev shell. Build aliases
 * pick exactly one implementation, so the other hosts are tree-shaken away.
 */

export type Runtime = "vscode" | "fresh" | "webview" | "browser";

export type GraphSourceKind = "computed" | "cbm";
export type GraphBackend = "cbm" | "scip";

/** A 1-based source location. Paths are workspace-relative when possible. */
export interface SourceLocation {
  project?: string;
  path: string;
  line?: number;
  column?: number;
  symbol?: string;
}

export interface ExtensionConfig {
  backend: GraphBackend;
  source: GraphSourceKind;
  cbmBaseUrl: string;
  project: string;
  symbolEntry: string;
  /** Absolute workspace root used to format copied absolute paths. */
  workspaceRoot: string;
  /** Workspace-relative config/renderer paths for Setup links. */
  configPath: string;
  nodeRendererPath: string;
  /** URL the webview/browser can import; empty when no renderer is available. */
  nodeRendererUrl: string;
}

import type { CbmHttpRequest, CbmHttpResponse } from "../lib/cbm-request";
import { NODE_RENDERER_FILE } from "../lib/node-renderer";
export type { CbmHttpRequest, CbmHttpResponse } from "../lib/cbm-request";

export interface ExtensionApi {
  readonly runtime: Runtime;
  getConfig(backend?: GraphBackend): Promise<ExtensionConfig>;
  fetchCbm(request: CbmHttpRequest): Promise<CbmHttpResponse>;
  openLocation(location: SourceLocation): Promise<void>;
  openSettings(query: string): Promise<void>;
  /** Restart a local cbm HTTP listener after a 5xx/transport failure. */
  restartCbm(): Promise<void>;
  setStatus(message: string, kind?: "info" | "error"): void;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  backend: "cbm",
  source: "computed",
  cbmBaseUrl: "http://127.0.0.1:9749",
  project: "demo",
  symbolEntry: "",
  workspaceRoot: "",
  configPath: "code-graph.config.jsonc",
  nodeRendererPath: NODE_RENDERER_FILE,
  nodeRendererUrl: "",
};
