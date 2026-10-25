import * as vscode from "vscode";

import { createExtensionApi } from "./hosts/vscode";
import { createGraphPanel } from "./panel";

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const api = createExtensionApi();

  context.subscriptions.push(
    vscode.commands.registerCommand("codeGraph.open", () => {
      if (panel) {
        panel.reveal(vscode.ViewColumn.Active);
        return;
      }

      panel = createGraphPanel(context, api);
      panel.onDidDispose(() => {
        panel = undefined;
      });
    }),
  );
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}
