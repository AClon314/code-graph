import * as vscode from "vscode";

import { createExtensionApi } from "./hosts/vscode";
import { createGraphPanel } from "./panel";

const api = createExtensionApi();
const panels = new Set<vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("codeGraph.open", () => openPanel(context, false)),
    vscode.commands.registerCommand("codeGraph.openNew", () => openPanel(context, true)),
  );
}

export function deactivate(): void {
  for (const panel of panels) panel.dispose();
  panels.clear();
}

function openPanel(context: vscode.ExtensionContext, newTab: boolean): void {
  if (!newTab) {
    const existing = panels.values().next().value;
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      return;
    }
  }

  const panel = createGraphPanel(context, api);
  panels.add(panel);
  panel.onDidDispose(() => panels.delete(panel));
}
