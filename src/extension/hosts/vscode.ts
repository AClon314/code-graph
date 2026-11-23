import * as vscode from "vscode";

import {
  DEFAULT_CONFIG,
  type CbmHttpRequest,
  type CbmHttpResponse,
  type ExtensionApi,
  type ExtensionConfig,
  type GraphBackend,
  type SourceLocation,
} from "../api";
import {
  CSS_CONFIG_FILE,
  backendConfig,
  configPaths,
  globalConfigRoot,
  loadOrCreateProjectConfig,
  projectConfigPaths,
  resolveNodeRendererPath,
  type ProjectConfig,
} from "../../lib/config";
import { NODE_RENDERER_FILE } from "../../lib/node-renderer";
import { fetchLocalCbm, resolveLocalCbm, restartLocalCbm } from "./cbm-node";

/**
 * VS Code extension-host implementation. This module may import `vscode`; the
 * webview and Fresh bundles never include it.
 */
interface EndpointEntry {
  configured: string;
  promise: Promise<string>;
}

let endpoint: EndpointEntry | null = null;
let activeWebview: vscode.WebviewPanel | null = null;

/** The panel currently hosting the graph; used to turn workspace files into webview URLs. */
export function setActiveGraphWebview(panel: vscode.WebviewPanel | null): void {
  activeWebview = panel;
}

function localEndpoint(configured: string): Promise<string> {
  if (endpoint?.configured === configured) return endpoint.promise;

  const promise = resolveLocalCbm(configured).catch((cause) => {
    // Let a later request retry after cbm was not running yet.
    if (endpoint?.configured === configured) endpoint = null;
    throw cause;
  });
  endpoint = { configured, promise };
  return promise;
}

function forgetEndpoint(configured: string): void {
  if (endpoint?.configured === configured) endpoint = null;
}

export function createExtensionApi(backend: GraphBackend = "cbm"): ExtensionApi {
  return {
    runtime: "vscode",
    async getConfig(requestedBackend?: GraphBackend) {
      const activeBackend = requestedBackend ?? backend;
      const configuration = vscode.workspace.getConfiguration("codeGraph");
      const fallbackProject = configuration.get<string>(
        "project",
        DEFAULT_CONFIG.project,
      );
      const projectConfig = await readProjectConfig();
      const resolved = backendConfig(projectConfig.config, activeBackend);
      const configuredSource = configuration.get<string>("source", "cbm");
      const source: ExtensionConfig["source"] =
        configuredSource === "computed" ? "computed" : "cbm";
      const configured = configuration.get<string>("cbmBaseUrl", DEFAULT_CONFIG.cbmBaseUrl);
      const cbmBaseUrl =
        source === "cbm" ? await localEndpoint(configured) : configured;
      return {
        backend: activeBackend,
        source,
        cbmBaseUrl,
        project:
          resolved.project ||
          configuration.get<string>(`${activeBackend}Project`, fallbackProject),
        symbolEntry:
          resolved.symbolEntry ||
          configuration.get<string>("symbolEntry", DEFAULT_CONFIG.symbolEntry),
        workspaceRoot: activeWorkspaceFolder()?.uri.fsPath ?? "",
        configPath: projectConfig.configPath,
        cssPath: projectConfig.cssPath,
        nodeRendererPath: projectConfig.nodeRendererPath,
        globalConfigPath: projectConfig.globalConfigPath,
        globalCssPath: projectConfig.globalCssPath,
        globalRendererPath: projectConfig.globalRendererPath,
        styleUrls: projectConfig.styleUrls,
        nodeRendererUrl: projectConfig.nodeRendererUrl,
      };
    },
    async fetchCbm(request: CbmHttpRequest): Promise<CbmHttpResponse> {
      const configuration = vscode.workspace.getConfiguration("codeGraph");
      const configured = configuration.get<string>("cbmBaseUrl", DEFAULT_CONFIG.cbmBaseUrl);
      const baseUrl = await localEndpoint(configured);
      try {
        return await fetchLocalCbm(baseUrl, request);
      } catch (cause) {
        // cbm may have restarted on a different ui_port; rediscover next time.
        forgetEndpoint(configured);
        throw cause;
      }
    },
    async openSettings(query) {
      await vscode.commands.executeCommand("workbench.action.openSettings", query);
    },
    async restartCbm() {
      const configuration = vscode.workspace.getConfiguration("codeGraph");
      const configured = configuration.get<string>(
        "cbmBaseUrl",
        DEFAULT_CONFIG.cbmBaseUrl,
      );
      await restartLocalCbm(configured);
      forgetEndpoint(configured);
    },
    async openLocation(location) {
      const uri = resolveUri(location);
      if (!uri) {
        throw new Error(
          `Cannot resolve ${location.path} inside a workspace folder`,
        );
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const line = clamp(location.line ?? 1, 1, document.lineCount) - 1;
      const column = Math.max(0, (location.column ?? 1) - 1);
      const position = new vscode.Position(line, column);
      const selection = new vscode.Selection(position, position);
      const editor = await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Active,
      });
      editor.selection = selection;
      editor.revealRange(
        selection,
        vscode.TextEditorRevealType.InCenterIfOutsideViewport,
      );
    },
    setStatus(message) {
      vscode.window.setStatusBarMessage(message, 4000);
    },
  };
}

interface HostProjectConfig {
  config: ProjectConfig;
  configPath: string;
  cssPath: string;
  nodeRendererPath: string;
  globalConfigPath: string;
  globalCssPath: string;
  globalRendererPath: string;
  styleUrls: string[];
  nodeRendererUrl: string;
}

async function readProjectConfig(): Promise<HostProjectConfig> {
  const folder = activeWorkspaceFolder();
  if (!folder) {
    return {
      config: {},
      configPath: projectConfigPaths("").team.replace(/^\//, ""),
      cssPath: CSS_CONFIG_FILE,
      nodeRendererPath: NODE_RENDERER_FILE,
      globalConfigPath: "",
      globalCssPath: "",
      globalRendererPath: "",
      styleUrls: [],
      nodeRendererUrl: "",
    };
  }
  const root = folder.uri.fsPath;
  const globalRoot = globalConfigRoot(process.env, process.platform);
  const relative = (path: string): string => {
    const base = root.replace(/[/\\]+$/, "");
    return path.startsWith(base) ? path.slice(base.length).replace(/^[/\\]+/, "") : path;
  };
  const uriFor = (path: string): vscode.Uri =>
    vscode.Uri.joinPath(folder.uri, relative(path));
  const readFile = async (path: string): Promise<string | null> => {
    try {
      const uri = isAbsolute(path) ? vscode.Uri.file(path) : uriFor(path);
      const data = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder().decode(data);
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        return null;
      }
      throw error;
    }
  };

  const loaded = await loadOrCreateProjectConfig(
    root,
    {
      readFile,
      writeFile: async (path, content) => {
        await vscode.workspace.fs.writeFile(
          isAbsolute(path) ? vscode.Uri.file(path) : uriFor(path),
          new TextEncoder().encode(content),
        );
      },
    },
    globalRoot,
  );
  const paths = configPaths(root, globalRoot);
  const renderer = await resolveNodeRendererPath(root, loaded, readFile, globalRoot);
  const webview = activeWebview?.webview;
  const rendererUri = webview
    ? webview.asWebviewUri(vscode.Uri.file(renderer)).toString()
    : "";
  const styleUrls: string[] = [];
  for (const path of [paths.global?.css, paths.project.css, paths.personal.css]) {
    if (!path || !webview) continue;
    if ((await readFile(path)) === null) continue;
    styleUrls.push(webview.asWebviewUri(vscode.Uri.file(path)).toString());
  }
  return {
    config: loaded.config,
    configPath: relative(paths.project.jsonc),
    cssPath: relative(paths.project.css),
    nodeRendererPath: relative(renderer),
    globalConfigPath: paths.global?.jsonc ?? "",
    globalCssPath: paths.global?.css ?? "",
    globalRendererPath: paths.global?.renderer ?? "",
    styleUrls,
    nodeRendererUrl: rendererUri,
  };
}

function activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const editor = vscode.window.activeTextEditor;
  const active = editor
    ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
    : undefined;
  return active ?? vscode.workspace.workspaceFolders?.[0];
}

function resolveUri(location: SourceLocation): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const folder =
    (location.project
      ? folders.find((candidate) => candidate.name === location.project)
      : undefined) ?? folders[0];

  if (isAbsolute(location.path)) return vscode.Uri.file(location.path);

  if (!folder) return undefined;
  return vscode.Uri.joinPath(
    folder.uri,
    ...location.path.split(/[\\/]+/).filter(Boolean),
  );
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
