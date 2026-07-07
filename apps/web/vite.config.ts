import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const apiUrl = process.env.API_URL || "http://localhost:8080";
const apiProxy = { target: apiUrl, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/auth": apiProxy,
      "/users": apiProxy,
      "/tasks": apiProxy,
      "/notes": apiProxy,
      "/projects": apiProxy,
      "/activity": apiProxy,
      "/search": apiProxy,
      "/sync": apiProxy,
      "/health": apiProxy,
    },
  },
});
