import { fileURLToPath } from "node:url";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const host = fileURLToPath(
    new URL(
      mode === "development"
        ? "./src/extension/hosts/browser.ts"
        : "./src/extension/hosts/webview.ts",
      import.meta.url,
    ),
  );

  return {
    plugins: [svelte()],
    resolve: {
      alias: {
        "#host": host,
      },
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      port: 5173,
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
      outDir: "dist/webview",
      emptyOutDir: true,
      // The code-server harness debugs this bundle in Chrome DevTools.
      sourcemap: true,
      rollupOptions: {
        input: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
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
