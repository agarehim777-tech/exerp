import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}/`;
const viteBin = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const smokeScript = resolve(rootDir, "scripts", "smoke.mjs");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("SMOKE_PORT must be an integer between 1024 and 65535");
}

await access(resolve(rootDir, "dist", "index.html"));

function wait(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForServer(processHandle) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error("Production preview server stopped before the smoke test");
    }
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // The local preview server is still starting.
    }
    await wait(200);
  }
  throw new Error("Production preview server did not become ready within 10 seconds");
}

function run(command, args, env) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectResult);
    child.once("exit", (code) => resolveResult(code ?? 1));
  });
}

const preview = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: rootDir,
  stdio: "inherit",
  windowsHide: true,
});

try {
  await waitForServer(preview);
  const exitCode = await run(process.execPath, [smokeScript], {
    ...process.env,
    SMOKE_BASE_URL: baseUrl,
  });
  process.exitCode = exitCode;
} finally {
  preview.kill();
}
