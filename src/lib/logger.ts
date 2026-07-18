import { supabase } from "../integrations/supabase/client";

type Level = "debug" | "info" | "warn" | "error" | "fatal";

interface LogPayload {
  level: Level;
  message: string;
  source?: string;
  context?: Record<string, unknown> | null;
  stack?: string;
}

async function write(payload: LogPayload) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) {
      // Not signed in — RLS would reject; skip remote log
      // eslint-disable-next-line no-console
      console.log(`[log:${payload.level}]`, payload.message, payload.context ?? "");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    await supabase.from("app_logs").insert({
      user_id: user.id,
      tenant_id: profile?.active_tenant_id ?? null,
      level: payload.level,
      source: payload.source ?? "web",
      message: payload.message.slice(0, 4000),
      context: (payload.context ?? null) as any,
      stack: payload.stack?.slice(0, 8000) ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
    });
  } catch (err) {
    // Never let logging errors bubble
    // eslint-disable-next-line no-console
    console.warn("logger failed", err);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    write({ level: "debug", message, context }),
  info: (message: string, context?: Record<string, unknown>) =>
    write({ level: "info", message, context }),
  warn: (message: string, context?: Record<string, unknown>) =>
    write({ level: "warn", message, context }),
  error: (message: string, context?: Record<string, unknown>, stack?: string) =>
    write({ level: "error", message, context, stack }),
  fatal: (message: string, context?: Record<string, unknown>, stack?: string) =>
    write({ level: "fatal", message, context, stack }),
};

// Global handlers — capture unhandled errors and promise rejections
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    logger.error(e.message || "window.error", { filename: e.filename, lineno: e.lineno }, e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const msg = reason?.message || String(reason);
    logger.error(`unhandledrejection: ${msg}`, {}, reason?.stack);
  });
}
