import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

/** Dev/preview endpoint for raw workspace config files (HTML must not be transformed). */
function configFilesPlugin(): Plugin {
  const workspace = resolve(process.env.CODE_GRAPH_WORKSPACE_ROOT ?? process.cwd());
  const handler = async (
    req: { url?: string; method?: string },
    res: {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
      end: (body?: string) => void;
    },
    next: () => void,
  ): Promise<void> => {
    if (!req.url?.startsWith("/api/config-file")) {
      next();
      return;
    }
    if ((req.method ?? "GET") !== "GET") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }
    const requested = new URL(req.url, "http://code-graph.local").searchParams.get("path") ?? "";
    const absolute = resolve(workspace, requested);
    if (absolute !== workspace && !absolute.startsWith(workspace + sep)) {
      res.statusCode = 403;
      res.end("path outside workspace");
      return;
    }
    try {
      const text = await readFile(absolute, "utf8");
      // The browser host imports renderNode.config.mjs through this endpoint.
      res.setHeader(
        "content-type",
        /\.m?js$/i.test(absolute)
          ? "text/javascript; charset=utf-8"
          : "text/plain; charset=utf-8",
      );
      res.setHeader("cache-control", "no-store");
      res.end(text);
    } catch {
      if (new URL(req.url, "http://code-graph.local").searchParams.has("optional")) {
        res.statusCode = 200;
        res.setHeader("cache-control", "no-store");
        res.end("");
        return;
      }
      res.statusCode = 404;
      res.end("file not found");
    }
  };
  return {
    name: "code-graph-config-files",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const standalone = mode === "development" || mode === "web";
  const host = fileURLToPath(
    new URL(
      standalone
        ? "./src/extension/hosts/browser.ts"
        : "./src/extension/hosts/webview.ts",
      import.meta.url,
    ),
  );
  const cbmProxy: ProxyOptions = {
    target: process.env.CBM_HTTP ?? "http://127.0.0.1:9749",
    changeOrigin: true,
    // cbm treats a different localhost port as a different principal. The
    // dev/preview proxy is same-origin for the browser, so do not forward the
    // Vite origin as a cross-origin request.
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.removeHeader("origin");
      });
    },
  };

  return {
    plugins: [svelte(), configFilesPlugin()],
    define: {
      // The browser host has no Node `process`; bake the caller's cwd in so
      // copied absolute paths are meaningful in `bun run web`.
      __CODE_GRAPH_WORKSPACE_ROOT__: JSON.stringify(
        process.env.CODE_GRAPH_WORKSPACE_ROOT ?? process.cwd(),
      ),
    },
    resolve: {
      alias: {
        "#host": host,
      },
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      port: 5173,
      // code-server/e2e profiles symlink this repo into themselves. Following
      // that link makes the watcher walk its own output tree forever (CPU/OOM).
      watch: {
        ignored: ["**/.code-server/**", "**/out/**", "**/.git/**"],
        followSymlinks: false,
      },
      proxy: {
        "/api": cbmProxy,
        "/rpc": cbmProxy,
      },
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": cbmProxy,
        "/rpc": cbmProxy,
      },
    },
    build: {
      outDir: standalone ? "out/dist/web" : "out/dist/webview",
      emptyOutDir: true,
      // The code-server harness debugs this bundle in Chrome DevTools.
      sourcemap: true,
      rollupOptions: {
        input: fileURLToPath(
          new URL(standalone ? "./index.html" : "./src/main.ts", import.meta.url),
        ),
        output: {
          entryFileNames: "assets/webview.js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: (assetInfo) =>
            assetInfo.name?.endsWith(".css")
              ? "assets/webview.css"
              : "assets/[name][extname]",
        },
      },
    },
  };
});
