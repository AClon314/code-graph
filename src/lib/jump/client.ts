import type { JumpReceipt, JumpRequest, JumpTarget } from "./types";

export interface JumpClientOptions {
  /** Bridge base URL. Defaults to `VITE_CODE_NAV_BRIDGE` or current host :9752. */
  baseUrl?: string;
  /** Bearer token for a bridge exposed beyond loopback. */
  token?: string;
  fetchImpl?: typeof fetch;
}

function defaultBaseUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:9752";
  const configured = import.meta.env?.VITE_CODE_NAV_BRIDGE;
  if (configured) return String(configured).replace(/\/+$/, "");
  return `${window.location.protocol}//${window.location.hostname}:9752`;
}

export function jumpTargetFrom(
  project: string,
  row: { filePath?: string; startLine?: number; qualifiedName?: string; name?: string },
  source: JumpTarget["source"] = "gui",
): JumpTarget | null {
  if (!row.filePath) return null;
  return {
    project,
    path: row.filePath,
    line: row.startLine ?? 1,
    symbol: row.qualifiedName ?? row.name,
    source,
  };
}

/**
 * Sends a jump to the local bridge. The bridge is deliberately separate from
 * cbm: cbm remains loopback-only, while the bridge is the one small surface a
 * Fresh/VSCode adapter polls.
 */
export class JumpClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JumpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
    this.token = options.token ?? import.meta.env?.VITE_CODE_NAV_TOKEN;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async send(target: JumpRequest): Promise<JumpReceipt> {
    const response = await this.fetchImpl(`${this.baseUrl}/jump`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(target),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`jump bridge ${response.status}: ${body.slice(0, 200)}`);
    }
    return (await response.json()) as JumpReceipt;
  }
}

/** Best-effort fallback for local development without a bridge. */
export function emitJumpEvent(target: JumpTarget): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<JumpTarget>("code-nav:jump", { detail: target }));
}
