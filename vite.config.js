import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

const APP_BUILD_ID = process.env.VITE_APP_BUILD_ID || String(Date.now());
// Public Lovable Cloud values (safe in the browser bundle; RLS protects the data).
const DEVELOPMENT_URL = "https://rojwxgndtunssjdwngrh.supabase.co";
const DEVELOPMENT_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvand4Z25kdHVuc3NqZHduZ3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTkxNzUsImV4cCI6MjA5OTk3NTE3NX0.E9U85xBUMIuiI6ypj7Zy259pxhyjxkGjh9wSPplmIgU";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  // Hosted builds inject the values as real environment variables (no .env file).
  const resolvedUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
  const resolvedKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  const cloudUrl = resolvedUrl || DEVELOPMENT_URL;
  const cloudPublishableKey = resolvedKey || DEVELOPMENT_PUBLISHABLE_KEY;

  if (mode === "production" && (!resolvedUrl || !resolvedKey)) {
    console.warn("[build] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not found; using fallback values.");
  }

  return {
  base: process.env.VITE_BASE_PATH || "/",
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
  },
  plugins: [
    react(),
    mcpPlugin(),
  ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.endsWith("/src/data.js")) return "app-data";
          if (normalizedId.endsWith("/src/remote-api.js")) return "app-remote";
          if (normalizedId.includes("/src/config/")) return "app-config";
          if (normalizedId.includes("/src/services/")) return "app-services";
          if (normalizedId.includes("/src/components/")) return "app-ui";
          // Note: /src/modules/ intentionally NOT bundled together — each lazy() import
          // becomes its own route-based chunk for optimal code splitting.
          if (id.includes("node_modules/react-router")) return "router-vendor";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) return "react-vendor";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/@supabase")) return "supabase-vendor";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory")) return "charts-vendor";
          if (id.includes("node_modules/@sentry")) return "sentry-vendor";
          if (id.includes("node_modules/@ai-sdk") || id.includes("node_modules/ai/")) return "ai-vendor";
          if (id.includes("node_modules/@dnd-kit")) return "dnd-vendor";
          if (id.includes("node_modules/zod")) return "zod-vendor";
          if (id.includes("node_modules")) return "vendor";
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
  preview: { host: "127.0.0.1" },
  };
});

