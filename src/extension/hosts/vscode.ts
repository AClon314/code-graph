import * as vscode from "vscode";

import {
  DEFAULT_CONFIG,
  type ExtensionApi,
  type ExtensionConfig,
  type SourceLocation,
} from "../api";

/**
 * VS Code extension-host implementation. This module may import `vscode`; the
 * webview and Fresh bundles never include it.
 */
export function createExtensionApi(): ExtensionApi {
  return {
    runtime: "vscode",
    async getConfig() {
      const configuration = vscode.workspace.getConfiguration("codeGraph");
      return {
        source: configuration.get<ExtensionConfig["source"]>(
          "source",
          DEFAULT_CONFIG.source,
        ),
        cbmBaseUrl: configuration.get<string>(
          "cbmBaseUrl",
          DEFAULT_CONFIG.cbmBaseUrl,
        ),
        project: configuration.get<string>("project", DEFAULT_CONFIG.project),
        symbol: configuration.get<string>("symbol", DEFAULT_CONFIG.symbol),
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
