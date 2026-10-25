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
 * React graph-ui origin. Never hard-code a host: use the host the page was
 * loaded from, so LAN/Tailscale/reverse-proxy access keeps working.
 *
 * - `VITE_REACT_UI`: full override (`https://ui.example`, `/legacy`, or
 *   `same-origin`)
 * - `VITE_REACT_PORT`: port on the current hostname (default 9749)
 */
function currentHostReactBase(): string {
  if (typeof window === "undefined") return "same-origin";
  const port = import.meta.env?.VITE_REACT_PORT ?? "9749";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

export function reactWorkspaceUrl(
  workspace: ReactWorkspace,
  base = import.meta.env?.VITE_REACT_UI ?? currentHostReactBase()
): string {
  const path = `/?workspace=${encodeURIComponent(workspace)}`;
  if (!base || base === "same-origin") return path;
  return `${base.replace(/\/+$/, "")}${path}`;
}
