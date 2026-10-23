import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";

import schema from "../contracts/generated/code-nav.schema.json";
import { JumpClient, JumpRpcError } from "../src/lib/jump/client";

const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const [name, definition] of Object.entries((schema as { $defs: Record<string, unknown> }).$defs)) {
  ajv.addSchema(definition as Record<string, unknown>, name);
}
ajv.addSchema(schema);

function validator(name: string) {
  const validate = ajv.getSchema(`code-nav.schema.json#/$defs/${name}`);
  if (!validate) throw new Error(`missing ${name}`);
  return validate;
}

test("generated jump params reject invalid line with an instance path", () => {
  const validate = validator("JumpOpenParams");
  expect(
    validate({
      project: "p",
      path: "src/a.ts",
      line: 0,
      client: "fresh",
    }),
  ).toBe(false);
  expect(validate.errors?.some((error) => error.instancePath === "/line")).toBe(true);

  expect(
    validate({
      project: "p",
      path: "src/a.ts",
      line: 1,
      client: "fresh",
    }),
  ).toBe(true);
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
