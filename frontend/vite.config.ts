import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:3000",
        ws: true,
      },
      "/output": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/assets": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        bypass(req) {
          const path = req.url?.split("?")[0] ?? "";
          if (path === "/assets" || path === "/assets/") {
            return "/index.html";
          }
        },
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
