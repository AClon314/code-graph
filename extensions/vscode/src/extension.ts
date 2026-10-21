import * as vscode from "vscode";

interface JumpTarget {
  project?: string;
  path: string;
  line: number;
  column?: number;
  symbol?: string;
}

let pollTimer: ReturnType<typeof setInterval> | undefined;
let polling = false;
let lastKey = "";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("codeNav.open", async (target?: Partial<JumpTarget>) => {
      if (!target?.path) {
        void vscode.window.showInformationMessage(
          "Code Nav: open a node from the code-graph UI, or pass a path/line target.",
        );
        return;
      }
      await openTarget({
        path: target.path,
        line: target.line ?? 1,
        column: target.column,
        project: target.project,
        symbol: target.symbol,
      });
    }),
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        const params = new URLSearchParams(uri.query);
        const path = params.get("path");
        if (!path) return;
        void openTarget({
          path,
          line: Number(params.get("line") ?? 1),
          column: params.get("column") ? Number(params.get("column")) : undefined,
          project: params.get("project") ?? undefined,
          symbol: params.get("symbol") ?? undefined,
        });
      },
    }),
  );

  const configuration = vscode.workspace.getConfiguration("codeNav");
  const interval = Math.max(100, Number(configuration.get("pollMs") ?? 500));
  pollTimer = setInterval(() => {
    void pollBridge();
  }, interval);
  context.subscriptions.push({
    dispose() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    },
  });
}

export function deactivate(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

async function pollBridge(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const configuration = vscode.workspace.getConfiguration("codeNav");
    const base = String(configuration.get("bridgeUrl") ?? "http://127.0.0.1:9752").replace(/\/+$/, "");
    const token = String(configuration.get("token") ?? "");
    const response = await fetch(`${base}/jump/next?client=vscode`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (response.status === 204) return;
    if (!response.ok) return;
    const target = (await response.json()) as JumpTarget;
    if (!target || typeof target.path !== "string" || !Number.isFinite(target.line)) return;
    const key = `${target.project ?? ""}|${target.path}|${target.line}|${target.column ?? 1}|${target.symbol ?? ""}`;
    if (key === lastKey) return;
    lastKey = key;
    await openTarget(target);
  } catch {
    // The bridge is optional; a stopped bridge must not spam the extension host.
  } finally {
    polling = false;
  }
}

async function openTarget(target: JumpTarget): Promise<void> {
  const folder = pickFolder(target.project, target.path);
  const uri = resolveUri(folder, target.path);
  if (!uri) {
    void vscode.window.showWarningMessage(
      `Code Nav: cannot resolve ${target.path} inside a workspace folder.`,
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const line = Math.max(0, Math.trunc(target.line) - 1);
  const column = Math.max(0, Math.trunc(target.column ?? 1) - 1);
  const position = new vscode.Position(line, column);
  const selection = new vscode.Selection(position, position);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false,
    viewColumn: vscode.ViewColumn.Active,
  });
  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function pickFolder(project: string | undefined, filePath: string): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (project) {
    const byName = folders.find((folder) => folder.name === project);
    if (byName) return byName;
  }
  if (filePath.startsWith("/")) {
    return folders.find((folder) => isInside(folder.uri.fsPath, filePath));
  }
  return folders[0];
}

function resolveUri(folder: vscode.WorkspaceFolder | undefined, filePath: string): vscode.Uri | undefined {
  if (filePath.startsWith("/")) {
    if (!folder) return undefined;
    if (!isInside(folder.uri.fsPath, filePath)) return undefined;
    return vscode.Uri.file(filePath);
  }
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, filePath);
}

function isInside(root: string, path: string): boolean {
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`) || path.startsWith(`${normalizedRoot}\\`);
}
