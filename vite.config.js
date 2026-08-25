import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

const APP_BUILD_ID = process.env.VITE_APP_BUILD_ID || String(Date.now());
// Public Lovable Cloud values (safe in the browser bundle; RLS protects the data).
const DEVELOPMENT_URL = "https://tcqdhwtnjrwpfdxoijmv.supabase.co";
const DEVELOPMENT_PUBLISHABLE_KEY =
  "sb_publishable_ltaNA7nnVozoSCOcZIjg";

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
        // Only the React runtime is pinned to a stable shared chunk. Everything
        // else is left to the bundler's reachability analysis so that libraries
        // reachable *only* through a lazy() route (recharts, the AI SDK, dnd-kit)
        // stay out of the initial payload. Hand-written vendor buckets used to
        // force those libraries into the entry graph.
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) return undefined;
          if (
            /\/node_modules\/(react|react-dom|scheduler|react-is|object-assign)\//.test(normalizedId)
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
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

