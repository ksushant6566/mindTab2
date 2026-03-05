import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:8080",
      "/users": "http://localhost:8080",
      "/goals": "http://localhost:8080",
      "/habits": "http://localhost:8080",
      "/habit-tracker": "http://localhost:8080",
      "/journals": "http://localhost:8080",
      "/projects": "http://localhost:8080",
      "/activity": "http://localhost:8080",
      "/search": "http://localhost:8080",
      "/sync": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
