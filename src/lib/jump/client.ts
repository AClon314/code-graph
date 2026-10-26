import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JumpNextParams,
  JumpNextResult,
  JumpReceipt,
  JumpRequest,
} from "./types";
import { isJsonRpcFailure, JSON_RPC_VERSION, RPC_PATH } from "./types";

export interface JumpClientOptions {
  /** Bridge base URL. Defaults to `VITE_CODE_NAV_BRIDGE` or current host :9752. */
  baseUrl?: string;
  /** Bearer token for a bridge exposed beyond loopback. */
  token?: string;
  fetchImpl?: typeof fetch;
  /** JSON-RPC id generator; useful for deterministic tests. */
  nextId?: () => JsonRpcId;
}

export class JumpRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "JumpRpcError";
    this.code = code;
    this.data = data;
  }
}

function defaultBaseUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:9752";
  const configured = import.meta.env?.VITE_CODE_NAV_BRIDGE;
  if (configured) return String(configured).replace(/\/+$/, "");
  return `${window.location.protocol}//${window.location.hostname}:9752`;
}

/**
 * JSON-RPC 2.0 client for the local jump bridge.
 *
 * The bridge is deliberately separate from cbm: cbm remains loopback-only,
 * while the bridge is the small JSON-RPC surface editor adapters call.
 */
export class JumpClient {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nextId: () => JsonRpcId;
  private requestSeq = 0;

  constructor(options: JumpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
    this.token = options.token ?? import.meta.env?.VITE_CODE_NAV_TOKEN;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.nextId = options.nextId ?? (() => `gui-${++this.requestSeq}`);
  }

  async call<P, R>(method: string, params?: P): Promise<R> {
    const id = this.nextId();
    const request: JsonRpcRequest<P> = {
      jsonrpc: JSON_RPC_VERSION,
      id,
      method,
      ...(params === undefined ? {} : { params }),
    };
    const response = await this.fetchImpl(`${this.baseUrl}${RPC_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(request),
    });
    const text = await response.text();
    let payload: JsonRpcResponse<R>;
    try {
      payload = JSON.parse(text) as JsonRpcResponse<R>;
    } catch {
      throw new Error(`jump bridge ${response.status}: ${text.slice(0, 200)}`);
    }

    if (isJsonRpcFailure(payload)) {
      throw new JumpRpcError(payload.error.code, payload.error.message, payload.error.data);
    }
    if (!response.ok) {
      throw new Error(`jump bridge ${response.status}: ${text.slice(0, 200)}`);
    }
    return payload.result;
  }

  async send(target: JumpRequest): Promise<JumpReceipt> {
    return this.call<JumpRequest, JumpReceipt>("jump.open", target);
  }

  async next(params: JumpNextParams): Promise<JumpNextResult | null> {
    return this.call<JumpNextParams, JumpNextResult | null>("jump.next", params);
  }
}
