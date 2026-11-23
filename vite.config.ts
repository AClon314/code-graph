import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

import { globalConfigRoot } from "./src/lib/config";

const execFileAsync = promisify(execFile);
const GLOBAL_CONFIG_ROOT = globalConfigRoot(process.env, process.platform);

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Dev/preview endpoint for raw workspace config files (HTML must not be transformed). */
function configFilesPlugin(): Plugin {
  const workspace = resolve(process.env.CODE_GRAPH_WORKSPACE_ROOT ?? process.cwd());
  const globalRoot = GLOBAL_CONFIG_ROOT;
  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    if (req.url?.startsWith("/__code-graph/restart-cbm")) {
      if ((req.method ?? "GET") !== "POST") {
        res.statusCode = 405;
        res.end("method not allowed");
        return;
      }
      try {
        const script = fileURLToPath(new URL("./scripts/restart-cbm.sh", import.meta.url));
        const port = process.env.CBM_PORT || "9749";
        await execFileAsync("bash", [script], {
          timeout: 20_000,
          env: { ...process.env, CBM_PORT: port, CBM_AUTOSTART: "1" },
        });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true, port }));
      } catch (cause) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: false,
            error: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      }
      return;
    }
    if (!req.url?.startsWith("/api/config-file")) {
      next();
      return;
    }
    const params = new URL(req.url, "http://code-graph.local").searchParams;
    if ((req.method ?? "GET") === "POST") {
      try {
        const payload = JSON.parse(await readRequestBody(req)) as {
          path?: unknown;
          global?: unknown;
          content?: unknown;
        };
        if (
          typeof payload.path !== "string" ||
          typeof payload.content !== "string"
        ) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "path and content are required" }));
          return;
        }
        const requested = payload.path;
        if (!/^\.?code-graph\.config\.(jsonc|css|mjs|js|json)$/i.test(basename(requested))) {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "only code-graph.config.* files are writable" }));
          return;
        }
        const isGlobal = payload.global === true || params.get("global") === "1";
        const base = isGlobal ? globalRoot : workspace;
        const absolute = resolve(base, requested);
        if (absolute !== base && !absolute.startsWith(base + sep)) {
          res.statusCode = 403;
          res.end(isGlobal ? "path outside global config" : "path outside workspace");
          return;
        }
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, payload.content, "utf8");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify({ saved: true, path: absolute }));
      } catch (cause) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      }
      return;
    }
    if ((req.method ?? "GET") !== "GET") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }
    const requested = params.get("path") ?? "";
    const isGlobal = params.get("global") === "1";
    const base = isGlobal ? globalRoot : workspace;
    const absolute = resolve(base, requested);
    if (absolute !== base && !absolute.startsWith(base + sep)) {
      res.statusCode = 403;
      res.end(isGlobal ? "path outside global config" : "path outside workspace");
      return;
    }
    try {
      const text = await readFile(absolute, "utf8");
      // The browser host imports code-graph.config.mjs through this endpoint.
      res.setHeader(
        "content-type",
        /\.m?js$/i.test(absolute)
          ? "text/javascript; charset=utf-8"
          : /\.css$/i.test(absolute)
            ? "text/css; charset=utf-8"
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
      __CODE_GRAPH_GLOBAL_CONFIG__: JSON.stringify(GLOBAL_CONFIG_ROOT),
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
