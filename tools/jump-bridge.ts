#!/usr/bin/env bun
/**
 * code-nav jump bridge.
 *
 * The GUI POSTs a target; Fresh/VSCode adapters poll for the next target.
 * Keep this process separate from cbm: cbm stays loopback-only.
 *
 *   bun run jump:bridge
 *   CODE_NAV_BIND=0.0.0.0 CODE_NAV_TOKEN=... bun run jump:bridge
 */
import { randomUUID } from "node:crypto";

import type { JumpAck, JumpReceipt, JumpRequest } from "../src/lib/jump/types";

const PORT = Number(process.env.CODE_NAV_PORT ?? 9752);
const HOST = process.env.CODE_NAV_BIND ?? "127.0.0.1";
const TOKEN = process.env.CODE_NAV_TOKEN;
const TTL_MS = 30_000;

interface Pending {
  id: string;
  request: JumpRequest;
  createdAt: number;
}

const queue: Pending[] = [];

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

function prune(): void {
  const now = Date.now();
  while (queue.length > 0 && now - queue[0]!.createdAt > TTL_MS) queue.shift();
}

function take(client: string | null): Pending | undefined {
  prune();
  if (!client) return queue.shift();
  const index = queue.findIndex(
    (entry) => !entry.request.client || entry.request.client === "any" || entry.request.client === client,
  );
  return index < 0 ? undefined : queue.splice(index, 1)[0];
}

function valid(target: JumpRequest): string | null {
  if (!target || typeof target !== "object") return "body must be an object";
  if (typeof target.project !== "string" || !target.project) return "project is required";
  if (typeof target.path !== "string" || !target.path) return "path is required";
  if (!Number.isInteger(target.line) || target.line < 1) return "line must be a positive integer";
  if (target.column !== undefined && (!Number.isInteger(target.column) || target.column < 1)) {
    return "column must be a positive integer";
  }
  return null;
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

    if (request.method === "POST" && url.pathname === "/jump") {
      let body: JumpRequest;
      try {
        body = (await request.json()) as JumpRequest;
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      const error = valid(body);
      if (error) return json({ error }, 400);
      const entry: Pending = { id: randomUUID(), request: body, createdAt: Date.now() };
      queue.push(entry);
      return json<JumpReceipt>({ id: entry.id, client: body.client }, 202);
    }

    if (request.method === "GET" && url.pathname === "/jump/next") {
      const entry = take(url.searchParams.get("client"));
      if (!entry) return new Response(null, { status: 204 });
      return json(entry.request);
    }

    if (request.method === "POST" && url.pathname === "/jump/ack") {
      let ack: JumpAck;
      try {
        ack = (await request.json()) as JumpAck;
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      if (!ack?.id || !ack.client) return json({ error: "id and client are required" }, 400);
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`code-nav jump bridge: http://${HOST}:${PORT} (token ${TOKEN ? "on" : "off"})`);
void server;
