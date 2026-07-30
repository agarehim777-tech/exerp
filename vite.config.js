import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    mcpPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Expert ERP",
        short_name: "ExERP",
        description: "Expert ERP вЂ” Г§oxЕџirkЙ™tli idarЙ™etmЙ™ platformasД±",
        theme_color: "#0F2A2E",
        background_color: "#0F2A2E",
        display: "standalone",
        start_url: "./",
        scope: "./",
        lang: "az",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/, /^\/functions\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-nav",
              networkTimeoutSeconds: 2,
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:js|css|woff2)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "gfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
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
          // Note: /src/modules/ intentionally NOT bundled together вЂ” each lazy() import
          // becomes its own route-based chunk for optimal code splitting.
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
          if (id.includes("node_modules/lucide-react")) return "icons";
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
});

