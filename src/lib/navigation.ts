/**
 * Navigation bridge to the stable React graph-ui.
 *
 * The Svelte shell owns only the call-graph surface for now. Every other
 * workspace stays in the React app, so cbm keeps one stable implementation
 * while the Svelte side is adopted one module at a time.
 */
export const REACT_WORKSPACES = [
  { id: "explore", label: "Explore" },
  { id: "galaxy", label: "Galaxy" },
  { id: "architecture", label: "Architecture" },
  { id: "adr", label: "ADR" },
  { id: "agents", label: "Agents" },
  { id: "coverage", label: "Coverage" },
  { id: "system", label: "System" },
] as const;

export type ReactWorkspace = (typeof REACT_WORKSPACES)[number]["id"];

/**
 * `base` is the React graph-ui origin.
 * - dev: `http://127.0.0.1:9749`
 * - cbm-embedded same origin: `same-origin`
 * - empty: relative URL (useful behind a reverse proxy)
 */
export function reactWorkspaceUrl(
  workspace: ReactWorkspace,
  base = import.meta.env?.VITE_REACT_UI ?? "http://127.0.0.1:9749"
): string {
  const path = `/?workspace=${encodeURIComponent(workspace)}`;
  if (!base || base === "same-origin") return path;
  return `${base.replace(/\/+$/, "")}${path}`;
}
