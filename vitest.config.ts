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
    // Bound WASM PostgreSQL forks so UI assertions do not compete with dozens of database instances.
    maxWorkers: 4,
    // Coverage instrumentation slows UI tests; give them room only in that run.
    testTimeout: process.argv.includes("--coverage") ? 20000 : 5000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: ["node_modules", "dist", "tests/**"],
    // npm run test:coverage (CI): how much of src the unit tests execute. Reported, not enforced yet.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.*", "src/integrations/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
  },
  resolve: {
    alias: { "@": path.resolve(projectRoot, "./src") },
  },
});
