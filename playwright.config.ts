import { defineConfig } from "@playwright/test";
import fs from "fs";

// Sandbox mühitində əvvəlcədən quraşdırılmış Chromium varsa ondan istifadə edirik,
// belə ki `playwright install` icra etmək mümkün olmaya bilər.
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/opt/ms-playwright/chromium-1194/chrome-linux/chrome",
].filter(Boolean) as string[];
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8080",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
