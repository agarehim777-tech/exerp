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
}

export async function registerPWA() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    await unregisterMatching();
    return;
  }
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent("erp:pwa-update"));
      },
    });
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
