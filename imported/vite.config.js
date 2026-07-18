import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.endsWith("/src/data.js")) {
            return "app-data";
          }
          if (normalizedId.endsWith("/src/remote-api.js")) {
            return "app-remote";
          }
          if (normalizedId.includes("/src/config/")) {
            return "app-config";
          }
          if (normalizedId.includes("/src/services/")) {
            return "app-services";
          }
          if (normalizedId.includes("/src/components/")) {
            return "app-ui";
          }
          if (normalizedId.includes("/src/modules/")) {
            return "app-modules";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    cors: false,
    fs: {
      strict: true,
      deny: [".env", ".env.*", "*.pem", "*.key", "**/.git/**"],
    },
  },
  preview: {
    host: "127.0.0.1",
  },
});
