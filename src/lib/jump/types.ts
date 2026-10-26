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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isJumpClientName(value: unknown): value is JumpClientName {
  return value === "fresh" || value === "vscode" || value === "any";
}

/** Runtime guard shared by the bridge and tests. */
export function isJumpTarget(value: unknown): value is JumpTarget {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.project) &&
    isNonEmptyString(value.path) &&
    isIntegerBetween(value.line, 1, Number.MAX_SAFE_INTEGER) &&
    (value.column === undefined ||
      isIntegerBetween(value.column, 1, Number.MAX_SAFE_INTEGER)) &&
    (value.symbol === undefined || typeof value.symbol === "string") &&
    (value.source === undefined || value.source === "gui" || value.source === "tui")
  );
}

export function isJumpRequest(value: unknown): value is JumpRequest {
  if (!isJumpTarget(value)) return false;
  const client = (value as unknown as Record<string, unknown>).client;
  return client === undefined || isJumpClientName(client);
}

export function isJumpNextParams(value: unknown): value is JumpNextParams {
  if (!isRecord(value) || !isJumpClientName(value.client)) return false;
  return value.waitMs === undefined || isIntegerBetween(value.waitMs, 0, 30_000);
}

export function isJumpAck(value: unknown): value is JumpAck {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.client) &&
    typeof value.ok === "boolean" &&
    (value.error === undefined || typeof value.error === "string")
  );
}
