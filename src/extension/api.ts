/**
 * The only editor-facing surface the GUI knows about.
 *
 * The same interface is implemented for VS Code, Fresh, the VS Code webview
 * (a postMessage proxy), and the standalone browser dev shell. Build aliases
 * pick exactly one implementation, so the other hosts are tree-shaken away.
 */

export type Runtime = "vscode" | "fresh" | "webview" | "browser";

export type GraphSourceKind = "mock" | "cbm";

/** A 1-based source location. Paths are workspace-relative when possible. */
export interface SourceLocation {
  project?: string;
  path: string;
  line?: number;
  column?: number;
  symbol?: string;
}

export interface ExtensionConfig {
  source: GraphSourceKind;
  cbmBaseUrl: string;
  project: string;
  symbol: string;
}

export interface ExtensionApi {
  readonly runtime: Runtime;
  getConfig(): Promise<ExtensionConfig>;
  openLocation(location: SourceLocation): Promise<void>;
  setStatus(message: string, kind?: "info" | "error"): void;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  source: "mock",
  cbmBaseUrl: "http://127.0.0.1:9749",
  project: "demo",
  symbol: "demo.src.features.useAlias",
};
