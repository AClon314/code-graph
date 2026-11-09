import { expect, test } from "bun:test";

import { JumpClient, JumpRpcError } from "../src/lib/jump/client";
import {
  isJumpAck,
  isJumpNextParams,
  isJumpRequest,
} from "../src/lib/jump/types";

test("jump request guard accepts valid targets and rejects bad fields", () => {
  expect(isJumpRequest({ project: "p", path: "src/a.ts", line: 1 })).toBe(true);
  expect(
    isJumpRequest({
      project: "p",
      path: "src/a.ts",
      line: 3,
      column: 2,
      source: "gui",
      client: "fresh",
    }),
  ).toBe(true);

  expect(isJumpRequest({ project: "p", path: "src/a.ts", line: 0 })).toBe(false);
  expect(
    isJumpRequest({ project: "p", path: "src/a.ts", line: 1, client: "bogus" }),
  ).toBe(false);
  expect(
    isJumpRequest({ project: "p", path: "src/a.ts", line: 1, source: "web" }),
  ).toBe(false);
});

test("jump.next and jump.ack guards accept valid params", () => {
  expect(isJumpNextParams({ client: "fresh" })).toBe(true);
  expect(isJumpNextParams({ client: "fresh", waitMs: 25_000 })).toBe(true);
  expect(isJumpNextParams({ client: "bogus" })).toBe(false);
  expect(isJumpNextParams({ client: "fresh", waitMs: -1 })).toBe(false);
  expect(isJumpNextParams({ client: "fresh", waitMs: 30_001 })).toBe(false);

  expect(isJumpAck({ id: "1", client: "fresh", ok: true })).toBe(true);
  expect(isJumpAck({ id: "1", client: "fresh", ok: false, error: "closed" })).toBe(true);
  expect(isJumpAck({ id: "1", client: "fresh", ok: "yes" })).toBe(false);
});

test("JumpClient sends a JSON-RPC jump.open request and returns the receipt", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "test-1",
        result: { id: "receipt-1", client: "fresh" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const client = new JumpClient({
    baseUrl: "http://bridge.test",
    fetchImpl: fakeFetch,
    nextId: () => "test-1",
  });
  const receipt = await client.send({ project: "p", path: "src/a.ts", line: 3 });

  expect(receipt).toEqual({ id: "receipt-1", client: "fresh" });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe("http://bridge.test/rpc");
  expect(calls[0]?.body).toEqual({
    jsonrpc: "2.0",
    id: "test-1",
    method: "jump.open",
    params: { project: "p", path: "src/a.ts", line: 3 },
  });
});

test("JumpClient surfaces a JSON-RPC params error", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32602,
          message: "Invalid params",
          data: [{ instancePath: "/line", message: "must be >= 1" }],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;

  const client = new JumpClient({ baseUrl: "http://bridge.test", fetchImpl: fakeFetch });
  await expect(client.send({ project: "p", path: "a.ts", line: 0 })).rejects.toThrow(
    JumpRpcError,
  );
});
