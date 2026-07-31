// Guarded PWA service-worker registration.
// Never registers in dev, iframe previews, or Lovable preview hosts.
// Kill switch: append ?sw=off to any URL to unregister.

const APP_BASE = import.meta.env.BASE_URL || "/";
const SW_URL = new URL("sw.js", new URL(APP_BASE, window.location.origin)).pathname;

function isRefusedContext() {
  try {
    if (!import.meta.env.PROD) return true;
    if (typeof window === "undefined") return true;
    if (window.top !== window.self) return true;
    const host = window.location.hostname;
    if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
    if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
    if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
    if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
    if (host === "github.io" || host.endsWith(".github.io")) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sw") === "off") return true;
    return false;
  } catch {
    return true;
  }
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        return url.endsWith(SW_URL);
      })
      .map((r) => r.unregister()),
  );
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.allSettled(
      names
        .filter((name) => name === "html-nav" || name === "static-assets" || name.startsWith("workbox-"))
        .map((name) => caches.delete(name)),
    );
  }
}

export async function registerPWA() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    await unregisterMatching();
    return;
  }
  try {
    const { registerSW } = await import("virtual:pwa-register");
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent("erp:pwa-update"));
        // Köhnə service worker aşkarlandı → dərhal yenisinə keç.
        purgeStaleCaches().finally(() => updateSW(true));
      },
    });
    installStaleWorkerWatcher();
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}

// Purge only this app's own runtime/precache buckets (origin-scoped storage may
// also hold messaging caches that must stay untouched).
async function purgeStaleCaches() {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.allSettled(
      names
        .filter((n) => n === "html-nav" || n === "static-assets" || n.startsWith("workbox-"))
        .map((n) => caches.delete(n)),
    );
  } catch {
    /* ignore */
  }
}

const CONTROLLER_RELOAD_FLAG = "erp:sw-reloaded";

// Watches for a newer service worker taking control and refreshes the page once
// so the user never stays on a stale app shell.
function installStaleWorkerWatcher() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    try {
      if (sessionStorage.getItem(CONTROLLER_RELOAD_FLAG)) return;
      sessionStorage.setItem(CONTROLLER_RELOAD_FLAG, "1");
    } catch {
      /* ignore */
    }
    purgeStaleCaches().finally(() => window.location.reload());
  });

  const checkForUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) return;
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await reg.update();
    } catch {
      /* ignore */
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.addEventListener("online", checkForUpdate);
  setInterval(checkForUpdate, 60 * 60 * 1000);
  checkForUpdate();
}


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

// --- Version guard -------------------------------------------------------
// Tətbiq versiyası (build id) dəyişəndə köhnə service worker + keşlər
// təmizlənir və səhifə bir dəfə yenidən yüklənir.
const VERSION_KEY = "erp:app-build-id";
const VERSION_RELOAD_FLAG = "erp:version-reloaded";
const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";

export async function installVersionGuard() {
  if (typeof window === "undefined") return;
  let previous = null;
  try {
    previous = localStorage.getItem(VERSION_KEY);
    localStorage.setItem(VERSION_KEY, APP_BUILD_ID);
  } catch {
    return;
  }
  if (!previous || previous === APP_BUILD_ID) return;

  let alreadyReloaded = false;
  try {
    alreadyReloaded = sessionStorage.getItem(VERSION_RELOAD_FLAG) === APP_BUILD_ID;
    sessionStorage.setItem(VERSION_RELOAD_FLAG, APP_BUILD_ID);
  } catch {
    /* ignore */
  }
  if (alreadyReloaded) return;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.update().catch(() => {})));
    }
  } catch {
    /* ignore */
  }
  await purgeStaleCaches();
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


