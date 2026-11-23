import type { ExtensionApi } from "../extension/api";
import type { FetchLike } from "./cbm-endpoint";

/** Adapt the extension host's cbm proxy to the fetch signature graph sources use. */
export function createHostFetch(
  fetchCbm: ExtensionApi["fetchCbm"],
): FetchLike {
  return async (input, init) => {
    const url = new URL(String(input));
    const response = await fetchCbm({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      method:
        init?.method === "POST" ? "POST" : init?.method === "DELETE" ? "DELETE" : "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const body =
      response.status === 204 || response.status === 205 || response.status === 304
        ? null
        : response.body;
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  };
}
