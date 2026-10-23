/**
 * A jump request is the only thing the GUI needs to know about an editor.
 * Paths are relative to the project root; lines and columns are 1-based
 * (SCIP/cbm convention). Each host adapter converts to its own editor API.
 */
export interface JumpTarget {
  /** cbm project name; the adapter uses it to choose a workspace root. */
  project: string;
  /** Repository-relative path, e.g. `src/lib/foo.ts`. */
  path: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column?: number;
  /** Optional symbol identity for highlighting/status. */
  symbol?: string;
  /** Optional source UI (`gui` by default). */
  source?: "gui" | "tui";
}

export type JumpClientName = "fresh" | "vscode" | "any";

export interface JumpRequest extends JumpTarget {
  /** Preferred consumer; omitted/`any` lets the first poller win. */
  client?: JumpClientName;
}

export interface JumpReceipt {
  id: string;
  client?: string;
}

export interface JumpAck {
  id: string;
  client: string;
  ok: boolean;
  error?: string;
}

/** Params for `jump.next`; `waitMs` turns the call into a long poll. */
export interface JumpNextParams {
  client: JumpClientName;
  waitMs?: number;
}

/** Result of `jump.next`; `null` means the wait elapsed with no target. */
export interface JumpNextResult {
  id: string;
  target: JumpTarget;
}

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: P;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: R;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<R = unknown> = JsonRpcSuccess<R> | JsonRpcFailure;

export const JSON_RPC_VERSION = "2.0";
export const RPC_PATH = "/rpc";
export const HEALTH_PATH = "/health";

/** JSON-RPC 2.0 standard error codes. */
export const RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export function isJsonRpcFailure(value: unknown): value is JsonRpcFailure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { error?: unknown };
  return Boolean(candidate.error && typeof candidate.error === "object");
}
