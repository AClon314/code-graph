import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.CBM_HTTP ?? "http://127.0.0.1:9749",
        changeOrigin: true,
      },
    },
  },
});
