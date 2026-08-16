// Stale service-worker caches can serve an outdated chunk manifest, which makes
// lazy route imports fail and leaves the user on a blank screen. Recover once
// by purging caches + service workers and doing a hard reload.
const RECOVERY_FLAG = "erp:chunk-recovery";

function looksLikeChunkError(message) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(
    message || "",
  );
}

async function recoverFromStaleAssets() {
  try {
    if (sessionStorage.getItem(RECOVERY_FLAG)) return;
    sessionStorage.setItem(RECOVERY_FLAG, "1");
  } catch {
    return;
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.allSettled(names.map((name) => caches.delete(name)));
    }
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    if (looksLikeChunkError(event?.message || event?.error?.message)) recoverFromStaleAssets();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    if (looksLikeChunkError(typeof reason === "string" ? reason : reason?.message)) recoverFromStaleAssets();
  });
  window.addEventListener("load", () => {
    try {
      sessionStorage.removeItem(RECOVERY_FLAG);
    } catch {
      /* ignore */
    }
  });
}


