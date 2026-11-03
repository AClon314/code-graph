import { describe, expect, test } from "bun:test";

import { cbmRequestUrl, requestCbm } from "../src/lib/cbm-request";
import type { FetchLike } from "../src/lib/cbm-endpoint";

const base = "http://127.0.0.1:9749/";

describe("cbm request URL", () => {
  test("keeps /api paths and appends query parameters", () => {
    const url = cbmRequestUrl(base, {
      path: "/api/symbol",
      query: { project: "p", qn: "a b" },
    });
    expect(url.href).toBe("http://127.0.0.1:9749/api/symbol?project=p&qn=a+b");
  });

  test("rejects paths that normalize outside /api/", () => {
    for (const path of ["/api/../secret", "/api/%2e%2e/secret", "/other"]) {
      expect(() => cbmRequestUrl(base, { path })).toThrow(/\/api\//);
    }
    expect(() => cbmRequestUrl(base, { path: "//evil.test/api/symbol" })).toThrow(
      /\/api\//,
    );
  });

  test("rejects non-http bases", () => {
    expect(() => cbmRequestUrl("file:///tmp/cbm", { path: "/api/symbol" })).toThrow(
      /http\(s\)/,
    );
  });
});

describe("cbm request transport", () => {
  test("returns status and body and only sends a body for POST", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response("{}", { status: 201 });
    };

    const response = await requestCbm(
      base,
      { path: "/api/symbol", query: { project: "p" } },
      { fetchImpl },
    );
    expect(response).toEqual({ status: 201, body: "{}" });
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.body).toBeUndefined();

    await requestCbm(
      base,
      { path: "/api/symbol", method: "POST", body: '{"x":1}' },
      { fetchImpl },
    );
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[1]?.init?.body).toBe('{"x":1}');
    expect(calls[1]?.init?.headers).toMatchObject({
      "content-type": "application/json",
    });
  });
});
