import * as vscode from "vscode";

import type { ExtensionApi, GraphBackend } from "./api";
import type { HostRequest, HostResponse } from "./protocol";

const FONT_CDN = "https://fontsapi.zeoseven.com";

/** Create the editor-tab webview that hosts the migrated Svelte GUI. */
export function createGraphPanel(
  context: vscode.ExtensionContext,
  api: ExtensionApi,
  backend: GraphBackend = "cbm",
): vscode.WebviewPanel {
  const title = backend === "scip" ? "code-graph (SCIP)" : "code-graph (cbm)";
  const panel = vscode.window.createWebviewPanel(
    "codeGraph.graph",
    title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "out", "dist", "webview"),
      ],
    },
  );

  const root = vscode.Uri.joinPath(context.extensionUri, "out", "dist", "webview");
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "assets", "webview.js"),
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(root, "assets", "webview.css"),
  );

  const csp = [
    "default-src 'none'",
    `img-src ${panel.webview.cspSource} data:`,
    `font-src ${panel.webview.cspSource} ${FONT_CDN}`,
    // The graph positions hit targets with inline style attributes.
    `style-src ${panel.webview.cspSource} 'unsafe-inline' ${FONT_CDN}`,
    `script-src ${panel.webview.cspSource}`,
    // The graph may talk to a local or remote cbm HTTP endpoint.
    `connect-src ${panel.webview.cspSource} http: https:`,
  ].join("; ");

  panel.webview.html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;

  const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
    void handleMessage(panel, api, message);
  });
  panel.onDidDispose(() => listener.dispose());

  return panel;
}

async function handleMessage(
  panel: vscode.WebviewPanel,
  api: ExtensionApi,
  message: unknown,
): Promise<void> {
  if (!isHostRequest(message)) return;

  try {
    if (message.type === "getConfig") {
      post(panel, {
        type: "config",
        id: message.id,
        config: await api.getConfig(),
      });
      return;
    }

    if (message.type === "openLocation") {
      await api.openLocation(message.location);
      post(panel, { type: "opened", id: message.id });
      return;
    }

    api.setStatus(message.message, message.kind);
  } catch (cause) {
    const id = "id" in message ? message.id : undefined;
    if (id === undefined) {
      api.setStatus(errorMessage(cause), "error");
      return;
    }
    post(panel, { type: "failed", id, message: errorMessage(cause) });
  }
}

function post(panel: vscode.WebviewPanel, message: HostResponse): void {
  void panel.webview.postMessage(message);
}

function isHostRequest(value: unknown): value is HostRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown };
  return (
    message.type === "getConfig" ||
    message.type === "openLocation" ||
    message.type === "status"
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
