# Multi-workspace feasibility

> Status: **design note only**. Neither the webview nor the Fresh plugin is
> multi-workspace aware yet. This records what the two runtimes actually offer,
> so the shared `ExtensionApi` can grow in the right shape.

## Short answer

Yes, Fresh supports multiple workspaces. They are called **windows** (what the
Orchestrator dock shows as sessions). Each window has its own root, splits,
buffers and language servers, and plugins can list and switch them.

VS Code supports **multi-root workspaces** in one window. The two models are
close enough for a shared "list workspaces / which is active / open here" API,
but they are not identical:

| Concept | VS Code | Fresh |
|---|---|---|
| Container | one window with `workspace.workspaceFolders[]` | one **window** per workspace/session |
| List | `vscode.workspace.workspaceFolders` | `editor.listWindows()` / orchestrator `listWorkspaces()` |
| Active | no per-folder "active" flag; the editor has one active file | `editor.activeWindow()`; `active_window_changed` event |
| Switch focus | no API to "focus a folder"; reveal/open a file | `editor.setActiveWindow(id)`; orchestrator `focusWorkspace(id)` |
| Relative paths | resolve against the workspace folder chosen by the caller | resolve against the window root; `editor.getCwd()` is the active root |
| Dormant workspaces | not represented | `discovered` / `pending` rows can have no window yet |

So a shared API should talk about **workspace references**, not "windows" or
"folders".

## Fresh API that matters

From `~/.config/fresh/types/fresh.d.ts` and `types/plugins.d.ts`:

```ts
type WindowInfo = {
  id: number;            // per-process window id
  stable_id: string;     // durable workspace id
  label: string;
  root: string;          // absolute project root
  project_path: string;  // canonical repo root
  // ...
};

editor.listWindows(): WindowInfo[];
editor.activeWindow(): number;
editor.setActiveWindow(id: number): boolean;
editor.createWindow(root: string, label: string): boolean;
editor.getCwd(): string;
```

Events (subscribe with `editor.on("active_window_changed", "handler")`):

```ts
window_created:       { id, label, root }
window_closed:        { id }
active_window_changed:{ previous_id, active_id }
```

The Orchestrator API adds durable identities and opens dormant workspaces:

```ts
const ws = getPluginApi("orchestrator").listWorkspaces();
// WorkspaceSummary: kind: "live" | "discovered" | "pending",
// workspaceId, windowId, active, name, root, projectPath, ...
await getPluginApi("orchestrator").focusWorkspace(workspaceId);
```

`focusWorkspace` is preferable to `setActiveWindow` when the row may be
`discovered`: it attaches a session first. `setActiveWindow` rejects the
synthetic negative `windowId` those rows carry.

## Proposed shared API

Add to `src/extension/api.ts`:

```ts
export interface WorkspaceRef {
  id: string;          // VS Code: folder URI; Fresh: stable_id or window id
  name: string;
  root: string;        // absolute path / URI string
  active: boolean;
}

export interface ExtensionApi {
  // ... existing getConfig/openLocation/setStatus
  listWorkspaces(): Promise<WorkspaceRef[]>;
  activeWorkspace(): Promise<WorkspaceRef | null>;
  focusWorkspace(id: string): Promise<boolean>;
  onDidChangeWorkspaces(listener: () => void): () => void;
}
```

Runtime mappings:

| Method | VS Code host | Fresh host | Browser host |
|---|---|---|---|
| `listWorkspaces` | `workspace.workspaceFolders` | `editor.listWindows()` (filter to real roots) | one fake workspace |
| `activeWorkspace` | folder containing `window.activeTextEditor`, else first | `listWindows().find(w => w.id === editor.activeWindow())` | the fake one |
| `focusWorkspace` | reveal/open a file in that folder; no true folder focus | `orchestrator.focusWorkspace(id)` or `setActiveWindow(id)` | no-op/false |
| `onDidChangeWorkspaces` | `onDidChangeWorkspaceFolders` | `active_window_changed` + `window_created` + `window_closed` | no-op |

In the webview host, all four become `postMessage` requests through the existing
request/response table in `src/extension/protocol.ts`.

## What "compute the call graph per workspace" needs

The editor workspace root is **not** a cbm project name. A mapping is required:

1. **Explicit setting** (simplest): extend `codeGraph` configuration with
   `codeGraph.projects: [{ root, project }]`, or a JSON map.
2. **Workspace metadata**: a `.code-graph.json` next to the root, so both
   VS Code and Fresh read the same file.
3. **cbm introspection**: query cbm's project list and match by path/name.
4. **Heuristic**: folder basename equals cbm project name; acceptable only as a
   fallback with a visible warning.

Once mapped, the flow is the same in both runtimes:

```text
listWorkspaces()
  -> for each mapped root: render frame(root, project, symbol)
  -> cache frame per workspaceId
  -> activeWorkspace() picks the visible frame
  -> onDidChangeWorkspaces() re-renders / switches
```

In Fresh, run the existing `tui/render.ts --cbm ...` with the workspace root as
`cwd` (or pass `--project`); in VS Code, fetch cbm from the extension host and
push data to the webview. Keep one frame cache keyed by `WorkspaceRef.id`.

## UI options

- **One panel, workspace picker** (recommended): a `vscode-single-select` in
  the toolbar listing workspaces; the active workspace follows editor focus.
  Matches VS Code multi-root, and the Fresh panel stays a single tab.
- **One panel per workspace**: VS Code can create several webview tabs; Fresh
  can create one virtual buffer per window. More code, and stale panels need
  lifecycle handling.

For Fresh, the second option fights the "new tab, not a split" change: each
workspace would add another tab. Prefer one tab with a picker.

## Risks / open questions

- **cbm project identity**: no reliable root-to-project mapping exists yet.
- **Relative paths**: cbm returns repo-relative paths. `openLocation` must
  resolve them against the workspace root, not the process cwd (Fresh already
  relies on window-root resolution).
- **Dormant Fresh workspaces**: `discovered` rows have no window; listing them
  is cheap, rendering them requires `focusWorkspace` first.
- **VS Code web sandbox**: only the opened workspace roots are visible; cannot
  enumerate arbitrary disk paths.
- **Which workspace is "active" in VS Code**: the active editor's folder is a
  good heuristic, but an editor can be outside any folder.
- **CORS**: the webview fetches cbm directly today; per-workspace fetching in
  vscode.dev makes the extension-host proxy more attractive.

None of this blocks the current single-workspace UI; it is a schema and host
adapter change, not a graph-core change.
