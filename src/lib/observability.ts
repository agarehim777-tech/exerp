import * as Sentry from "@sentry/react";
import React from "react";

const DSN = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
const RELEASE = (import.meta as any).env?.VITE_RELEASE_VERSION as string | undefined;
const ENV = (import.meta as any).env?.MODE as string | undefined;

let initialized = false;

export function initObservability() {
  if (initialized) return;
  initialized = true;

  if (DSN) {
    Sentry.init({
      dsn: DSN,
      release: RELEASE,
      environment: ENV,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
        Sentry.breadcrumbsIntegration({
          console: true,
          dom: true,
          fetch: true,
          history: true,
          xhr: true,
        }),
      ],
      tracesSampleRate: 0.2,
      replaysSessionSampleRate: 0.05,
      replaysOnErrorSampleRate: 1.0,
      sendDefaultPii: false,
    });
    // eslint-disable-next-line no-console
    console.info("[observability] Sentry initialized", { env: ENV, release: RELEASE });
  } else {
    // eslint-disable-next-line no-console
    console.info(
      "[observability] Sentry DSN not set (VITE_SENTRY_DSN). Falling back to enriched console logging.",
    );
    installConsoleFallback();
  }

  // Always attach global handlers so we never miss unhandled errors
  window.addEventListener("error", (e) => {
    // eslint-disable-next-line no-console
    console.error("[window.error]", {
      message: e.message,
      filename: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: any = e.reason;
    // eslint-disable-next-line no-console
    console.error("[unhandledrejection]", {
      message: r?.message || String(r),
      stack: r?.stack,
    });
  });
}

function installConsoleFallback() {
  const breadcrumbs: Array<{ t: number; type: string; data: any }> = [];
  const push = (type: string, data: any) => {
    breadcrumbs.push({ t: Date.now(), type, data });
    if (breadcrumbs.length > 50) breadcrumbs.shift();
  };
  // Route/nav breadcrumbs
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: any[]) {
    push("navigation", { to: args[2] });
    // @ts-ignore
    return origPush.apply(this, args);
  };
  history.replaceState = function (...args: any[]) {
    push("navigation", { to: args[2] });
    // @ts-ignore
    return origReplace.apply(this, args);
  };
  window.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (!t) return;
    push("click", { tag: t.tagName, id: t.id || undefined, text: (t.textContent || "").slice(0, 60) });
  }, true);
  // Expose for debugging
  (window as any).__breadcrumbs = () => breadcrumbs.slice();
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (DSN) {
    Sentry.captureException(error, { extra: context });
  } else {
    // eslint-disable-next-line no-console
    console.error("[captureError]", error, context, {
      breadcrumbs: (window as any).__breadcrumbs?.(),
    });
  }
}

export function setUser(user: { id: string; email?: string; tenantId?: string | null } | null) {
  if (!DSN) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id, email: user.email });
  if (user.tenantId) Sentry.setTag("tenant_id", user.tenantId);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export { Sentry };

// Optional helper for React Router integration if needed later
export const withProfiler = <P extends object>(Component: React.ComponentType<P>) =>
  DSN ? Sentry.withProfiler(Component) : Component;
