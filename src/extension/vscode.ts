import * as vscode from "vscode";

import type { GraphBackend } from "./api";
import { createExtensionApi } from "./hosts/vscode";
import { createGraphPanel } from "./panel";

const BACKENDS: readonly GraphBackend[] = ["cbm", "scip"];

const panels = new Map<GraphBackend, vscode.WebviewPanel>();
const apis = new Map(
  BACKENDS.map((backend) => [backend, createExtensionApi(backend)] as const),
);

export function activate(context: vscode.ExtensionContext): void {
  for (const backend of BACKENDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId(backend), () =>
        openPanel(context, backend),
      ),
    );
  }
}

export function deactivate(): void {
  for (const panel of panels.values()) panel.dispose();
  panels.clear();
}

function openPanel(
  context: vscode.ExtensionContext,
  backend: GraphBackend,
): void {
  const existing = panels.get(backend);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Active);
    return;
  }

  const panel = createGraphPanel(context, apis.get(backend)!, backend);
  panels.set(backend, panel);
  panel.onDidDispose(() => {
    if (panels.get(backend) === panel) panels.delete(backend);
  });
}

function commandId(backend: GraphBackend): string {
  return backend === "scip" ? "codeGraph.openScip" : "codeGraph.openCbm";
}
