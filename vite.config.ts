import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

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

  return {
    plugins: [svelte()],
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
        "/api": {
          target: process.env.CBM_HTTP ?? "http://127.0.0.1:9749",
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: true,
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
