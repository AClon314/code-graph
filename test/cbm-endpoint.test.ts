import { describe, expect, test } from "bun:test";

import {
  CbmEndpointError,
  DEFAULT_CBM_BASE_URL,
  discoverCbmEndpoint,
  formatCbmEndpointError,
  probeCbm,
} from "../src/lib/cbm-endpoint";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cbm endpoint discovery", () => {
  test("probes /api/ui-config and returns the version", async () => {
    const urls: string[] = [];
    const result = await probeCbm("http://127.0.0.1:9751/", async (input) => {
      urls.push(String(input));
      return response({ version: "0.12.1", lang: "en" });
    });
    expect(urls).toEqual(["http://127.0.0.1:9751/api/ui-config"]);
    expect(result).toMatchObject({ baseUrl: "http://127.0.0.1:9751", ui: { version: "0.12.1" } });
  });

  test("rejects a non-cbm HTTP response", async () => {
    await expect(
      probeCbm("http://127.0.0.1:9749", async () => response({ hello: "world" })),
    ).rejects.toThrow("not a cbm /api/ui-config response");
  });

  test("tries candidates in order and keeps every failure", async () => {
    const seen: string[] = [];
    const promise = discoverCbmEndpoint({
      candidates: ["http://127.0.0.1:9751", DEFAULT_CBM_BASE_URL],
      fetchImpl: async (input) => {
        const url = String(input);
        seen.push(url);
        if (url.includes(":9749")) return response({ version: "0.12.1" });
        throw new Error("connection refused");
      },
    });
    const result = await promise;
    expect(result.baseUrl).toBe(DEFAULT_CBM_BASE_URL);
    expect(seen).toHaveLength(2);
  });

  test("reports all attempts with stacks when nothing responds", async () => {
    try {
      await discoverCbmEndpoint({
        candidates: ["http://127.0.0.1:9751", DEFAULT_CBM_BASE_URL],
        fetchImpl: async () => {
          throw new Error("connection refused");
        },
      });
      throw new Error("expected failure");
    } catch (cause) {
      expect(cause).toBeInstanceOf(CbmEndpointError);
      const error = cause as CbmEndpointError;
      expect(error.attempts).toHaveLength(2);
      const formatted = formatCbmEndpointError(error);
      expect(formatted).toContain("9751");
      expect(formatted).toContain("9749");
      expect(formatted).toContain("connection refused");
    }
  });
});
