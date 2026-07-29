import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: ".vitest-cache",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: ["node_modules", "dist", "tests/**"],
  },
  resolve: {
    alias: { "@": path.resolve(projectRoot, "./src") },
  },
});
