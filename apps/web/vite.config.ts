import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const apiUrl = process.env.API_URL || "http://localhost:8080";

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
      "/auth": apiUrl,
      "/users": apiUrl,
      "/goals": apiUrl,
      "/habits": apiUrl,
      "/habit-tracker": apiUrl,
      "/journals": apiUrl,
      "/projects": apiUrl,
      "/activity": apiUrl,
      "/search": apiUrl,
      "/sync": apiUrl,
      "/health": apiUrl,
    },
  },
});
