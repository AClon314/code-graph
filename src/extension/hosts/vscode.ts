import * as vscode from "vscode";

import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type GraphBackend,
  type SourceLocation,
} from "../api";
import {
  TEAM_CONFIG_FILE,
  TEAM_CONFIG_TEMPLATE,
  backendConfig,
  loadProjectConfig,
} from "../../lib/config";

/**
 * VS Code extension-host implementation. This module may import `vscode`; the
 * webview and Fresh bundles never include it.
 */
export function createExtensionApi(backend: GraphBackend = "cbm"): ExtensionApi {
  return {
    runtime: "vscode",
    async getConfig() {
      const configuration = vscode.workspace.getConfiguration("codeGraph");
      const fallbackProject = configuration.get<string>(
        "project",
        DEFAULT_CONFIG.project,
      );
      const projectConfig = await readProjectConfig();
      const resolved = backendConfig(projectConfig, backend);
      return {
        backend,
        source: configuration.get<ExtensionConfig["source"]>(
          "source",
          "cbm",
        ),
        cbmBaseUrl: configuration.get<string>(
          "cbmBaseUrl",
          DEFAULT_CONFIG.cbmBaseUrl,
        ),
        project:
          resolved.project ||
          configuration.get<string>(`${backend}Project`, fallbackProject),
        symbolEntry:
          resolved.symbolEntry ||
          configuration.get<string>("symbolEntry", DEFAULT_CONFIG.symbolEntry),
      };
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

async function readProjectConfig() {
  const folder = activeWorkspaceFolder();
  if (!folder) return {};
  const relative = (path: string): string => {
    const root = folder.uri.fsPath.replace(/[/\\]+$/, "");
    return path.startsWith(root) ? path.slice(root.length).replace(/^[/\\]+/, "") : path;
  };
  const readFile = async (path: string): Promise<string | null> => {
    try {
      const data = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder.uri, relative(path)),
      );
      return new TextDecoder().decode(data);
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        return null;
      }
      throw error;
    }
  };
  const first = await loadProjectConfig(folder.uri.fsPath, readFile);
  if (first.sources.some((source) => source.found)) return first.config;
  try {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder.uri, TEAM_CONFIG_FILE),
      new TextEncoder().encode(TEAM_CONFIG_TEMPLATE),
    );
  } catch {
    // Read-only or trusted-mode restrictions: use defaults rather than
    // failing the whole graph panel.
    return first.config;
  }
  const created = await loadProjectConfig(folder.uri.fsPath, readFile);
  return created.config;
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

  if (isAbsolute(location.path)) {
    const uri = vscode.Uri.file(location.path);
    if (folders.length === 0) return uri;
    return vscode.workspace.getWorkspaceFolder(uri) ? uri : undefined;
  }

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
