#!/usr/bin/env bun
/**
 * code-nav jump bridge (JSON-RPC 2.0).
 *
 * Producers (GUI, VSCode, future tools) call `POST /rpc` with
 * `jump.open` / `jump.next` / `jump.ack`. Fresh's QuickJS sandbox cannot POST
 * with `editor.httpFetch`, so its plugin spawns `tools/jump-client.ts`, which
 * uses the same JSON-RPC endpoint.
 *
 *   bun run jump:bridge
 *   CODE_NAV_BIND=0.0.0.0 CODE_NAV_TOKEN=... bun run jump:bridge
 */
import { randomUUID } from "node:crypto";

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";

import schema from "../contracts/generated/code-nav.schema.json";
import type {
  JsonRpcFailure,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JumpAck,
  JumpNextParams,
  JumpNextResult,
  JumpReceipt,
  JumpRequest,
  JumpTarget,
} from "../src/lib/jump/types";
import { JSON_RPC_VERSION, RPC_ERROR } from "../src/lib/jump/types";

const PORT = Number(process.env.CODE_NAV_PORT ?? 9752);
const HOST = process.env.CODE_NAV_BIND ?? "127.0.0.1";
const TOKEN = process.env.CODE_NAV_TOKEN;
const TTL_MS = 30_000;
const MAX_WAIT_MS = 30_000;

interface Pending {
  id: string;
  target: JumpRequest;
  createdAt: number;
}

const queue: Pending[] = [];
const waiters = new Set<() => void>();

function authorized(request: Request): boolean {
  if (!TOKEN) return true;
  return request.headers.get("authorization") === `Bearer ${TOKEN}`;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function failure(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcFailure {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function success<R>(id: JsonRpcId, result: R): JsonRpcResponse<R> {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

function prune(): void {
  const now = Date.now();
  while (queue.length > 0 && now - queue[0]!.createdAt > TTL_MS) queue.shift();
}

function notify(): void {
  for (const wake of [...waiters]) wake();
}

function sameTarget(a: JumpRequest, b: JumpRequest): boolean {
  return (
    a.project === b.project &&
    a.path === b.path &&
    a.line === b.line &&
    (a.column ?? 1) === (b.column ?? 1) &&
    (a.symbol ?? "") === (b.symbol ?? "") &&
    (a.client ?? "any") === (b.client ?? "any")
  );
}

function safeTargetPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[A-Za-z]:[\\/]/.test(path)) return false;
  return !path.split(/[\\/]+/).includes("..");
}

function take(client: string | null): Pending | undefined {
  prune();
  if (!client) return queue.shift();
  const index = queue.findIndex(
    (entry) =>
      !entry.target.client ||
      entry.target.client === "any" ||
      entry.target.client === client,
  );
  return index < 0 ? undefined : queue.splice(index, 1)[0];
}

async function waitFor(client: string, waitMs: number): Promise<Pending | undefined> {
  const immediate = take(client);
  if (immediate || waitMs <= 0) return immediate;

  return new Promise<Pending | undefined>((resolve) => {
    let settled = false;
    const finish = (entry: Pending | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      waiters.delete(wake);
      resolve(entry);
    };
    const wake = (): void => {
      const entry = take(client);
      if (entry) finish(entry);
    };
    const timer = setTimeout(() => finish(undefined), Math.min(waitMs, MAX_WAIT_MS));
    waiters.add(wake);

    // Close the race between the first `take` and registering the waiter.
    const raced = take(client);
    if (raced) finish(raced);
  });
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const defs = (schema as { $defs?: Record<string, unknown> }).$defs ?? {};
for (const [name, definition] of Object.entries(defs)) {
  ajv.addSchema(definition as Record<string, unknown>, name);
}
ajv.addSchema(schema);

function validator(name: string): ValidateFunction {
  const found = ajv.getSchema(`code-nav.schema.json#/$defs/${name}`);
  if (!found) throw new Error(`missing generated JSON Schema: ${name}`);
  return found;
}

const validators = {
  "jump.open": validator("JumpOpenParams"),
  "jump.next": validator("JumpNextParams"),
  "jump.ack": validator("JumpAckParams"),
} as const;

type Method = keyof typeof validators;

function isMethod(value: string): value is Method {
  return Object.prototype.hasOwnProperty.call(validators, value);
}

function invalidParams(method: Method, params: unknown): JsonRpcFailure["error"] | null {
  const validate = validators[method];
  if (validate(params)) return null;
  return {
    code: RPC_ERROR.invalidParams,
    message: "Invalid params",
    data: validate.errors ?? [],
  };
}

async function handleRpc(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(failure(null, RPC_ERROR.parse, "Parse error"));
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(failure(null, RPC_ERROR.invalidRequest, "Invalid Request"));
  }

  const requestObject = payload as Partial<JsonRpcRequest>;
  const id =
    typeof requestObject.id === "string" ||
    typeof requestObject.id === "number" ||
    requestObject.id === null
      ? requestObject.id
      : null;

  if (
    requestObject.jsonrpc !== JSON_RPC_VERSION ||
    typeof requestObject.method !== "string" ||
    !Object.prototype.hasOwnProperty.call(requestObject, "id")
  ) {
    return json(failure(id, RPC_ERROR.invalidRequest, "Invalid Request"));
  }

  const method = requestObject.method;
  if (!isMethod(method)) {
    return json(failure(id, RPC_ERROR.methodNotFound, "Method not found"));
  }

  const params = requestObject.params ?? {};
  const paramError = invalidParams(method, params);
  if (paramError) return json(failure(id, paramError.code, paramError.message, paramError.data));

  try {
    if (method === "jump.open") {
      const target = params as JumpRequest;
      if (!safeTargetPath(target.path)) {
        return json(
          failure(id, RPC_ERROR.invalidParams, "Invalid params", [
            { instancePath: "/path", message: "must be a repository-relative path" },
          ]),
        );
      }
      const duplicate = queue.find((entry) => sameTarget(entry.target, target));
      if (duplicate) {
        return json(success(id, { id: duplicate.id, client: duplicate.target.client }));
      }
      const entry: Pending = { id: randomUUID(), target, createdAt: Date.now() };
      queue.push(entry);
      notify();
      const result: JumpReceipt = { id: entry.id, client: target.client };
      return json(success(id, result));
    }

    if (method === "jump.next") {
      const nextParams = params as JumpNextParams;
      const entry = await waitFor(nextParams.client, nextParams.waitMs ?? 0);
      const result: JumpNextResult | null = entry
        ? { id: entry.id, target: entry.target as JumpTarget }
        : null;
      return json(success(id, result));
    }

    const ack = params as JumpAck;
    return json(success(id, { ok: true, id: ack.id, client: ack.client }));
  } catch (cause) {
    return json(
      failure(
        id,
        RPC_ERROR.internal,
        "Internal error",
        cause instanceof Error ? cause.message : String(cause),
      ),
    );
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });
    if (!authorized(request)) return json({ error: "unauthorized" }, 401);

    if (request.method === "GET" && url.pathname === "/health") {
      prune();
      return json({ ok: true, pending: queue.length });
    }
    if (request.method === "POST" && url.pathname === "/rpc") {
      return handleRpc(request);
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`code-nav jump bridge: http://${HOST}:${PORT}/rpc (token ${TOKEN ? "on" : "off"})`);
void server;
