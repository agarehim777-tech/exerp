// Instrumented Supabase RPC / query wrapper.
// - Generates a correlation ID for each call (also readable on the returned promise).
// - Emits Sentry breadcrumbs (or console fallback) before/after each call.
// - Enriches errors with { correlationId, fn, durationMs, code, hint, details }.
// - Optionally forwards failures to the app_logs sink via `logger`.
import { supabase } from "../integrations/supabase/client";
import { Sentry, captureError } from "./observability";
import { logger } from "./logger";

type AnyRecord = Record<string, unknown>;

const DSN = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;

function newCorrelationId(): string {
  try {
    // @ts-ignore
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function breadcrumb(category: string, message: string, data: AnyRecord, level: "info" | "error" = "info") {
  if (DSN) {
    Sentry.addBreadcrumb({ category, message, data, level });
  } else {
    const bag: any[] = ((window as any).__breadcrumbs_rpc ||= []);
    bag.push({ t: Date.now(), category, message, data, level });
    if (bag.length > 100) bag.shift();
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : console.info)(`[${category}] ${message}`, data);
  }
}

function paramKeys(params: unknown): string[] {
  if (!params || typeof params !== "object") return [];
  return Object.keys(params as AnyRecord).slice(0, 20);
}

export interface RpcMeta {
  correlationId: string;
  fn: string;
  durationMs: number;
}

/**
 * Call a Supabase RPC with correlation-id + breadcrumbs + rich error metadata.
 * Returns { data, error, meta } — never throws. Use `rpcOrThrow` if you want throws.
 */
export async function rpc<T = unknown>(
  fn: string,
  params?: AnyRecord,
  options?: { source?: string },
): Promise<{ data: T | null; error: any; meta: RpcMeta }> {
  const correlationId = newCorrelationId();
  const source = options?.source ?? "web";
  const t0 = performance.now();

  breadcrumb("rpc", `→ ${fn}`, { correlationId, params: paramKeys(params), source });
  if (DSN) Sentry.setTag("last_rpc_cid", correlationId);

  const { data, error } = await supabase.rpc(fn as any, (params ?? {}) as any);
  const durationMs = Math.round(performance.now() - t0);
  const meta: RpcMeta = { correlationId, fn, durationMs };

  if (error) {
    const enriched = {
      correlationId,
      fn,
      durationMs,
      source,
      code: (error as any).code,
      hint: (error as any).hint,
      details: (error as any).details,
      message: (error as any).message,
      params: paramKeys(params),
    };
    breadcrumb("rpc", `✗ ${fn} failed`, enriched, "error");
    captureError(error, enriched);
    // Fire-and-forget remote log (RLS-safe; drops if signed out)
    logger.error(`rpc:${fn} ${enriched.message ?? "failed"}`, enriched, (error as any).stack);
    (error as any).correlationId = correlationId;
  } else {
    breadcrumb("rpc", `✓ ${fn}`, { correlationId, durationMs });
  }

  return { data: (data as T) ?? null, error, meta };
}

/** Same as `rpc`, but throws on error (with correlationId attached). */
export async function rpcOrThrow<T = unknown>(fn: string, params?: AnyRecord, options?: { source?: string }): Promise<T> {
  const { data, error, meta } = await rpc<T>(fn, params, options);
  if (error) {
    (error as any).correlationId = meta.correlationId;
    throw error;
  }
  return data as T;
}

/** Wrap an arbitrary PostgREST builder call with correlation + breadcrumbs. */
export async function trackQuery<T>(
  label: string,
  runner: () => PromiseLike<{ data: T | null; error: any }>,
  options?: { source?: string },
): Promise<{ data: T | null; error: any; meta: RpcMeta }> {
  const correlationId = newCorrelationId();
  const source = options?.source ?? "web";
  const t0 = performance.now();
  breadcrumb("db", `→ ${label}`, { correlationId, source });

  const { data, error } = await runner();
  const durationMs = Math.round(performance.now() - t0);
  const meta: RpcMeta = { correlationId, fn: label, durationMs };

  if (error) {
    const enriched = {
      correlationId,
      label,
      durationMs,
      source,
      code: (error as any).code,
      hint: (error as any).hint,
      details: (error as any).details,
      message: (error as any).message,
    };
    breadcrumb("db", `✗ ${label} failed`, enriched, "error");
    captureError(error, enriched);
    logger.error(`db:${label} ${enriched.message ?? "failed"}`, enriched, (error as any).stack);
    (error as any).correlationId = correlationId;
  } else {
    breadcrumb("db", `✓ ${label}`, { correlationId, durationMs });
  }
  return { data: data ?? null, error, meta };
}

/**
 * Monkey-patch `supabase.rpc` so every existing call site automatically benefits
 * from correlation IDs + breadcrumbs + Sentry enrichment, without a refactor.
 * Idempotent.
 */
export function instrumentSupabase() {
  const anySb = supabase as any;
  if (anySb.__rpcInstrumented) return;
  anySb.__rpcInstrumented = true;
  const originalRpc = anySb.rpc.bind(anySb);
  anySb.rpc = (fn: string, params?: AnyRecord, opts?: unknown) => {
    const correlationId = newCorrelationId();
    const t0 = performance.now();
    breadcrumb("rpc", `→ ${fn}`, { correlationId, params: paramKeys(params) });
    if (DSN) Sentry.setTag("last_rpc_cid", correlationId);

    const builder = originalRpc(fn, params, opts);
    // Attach correlation id for downstream inspection
    try { builder.__correlationId = correlationId; } catch {}

    const origThen = builder.then.bind(builder);
    builder.then = (onFulfilled: any, onRejected: any) =>
      origThen((result: any) => {
        const durationMs = Math.round(performance.now() - t0);
        if (result?.error) {
          const enriched = {
            correlationId,
            fn,
            durationMs,
            code: result.error.code,
            hint: result.error.hint,
            details: result.error.details,
            message: result.error.message,
            params: paramKeys(params),
          };
          breadcrumb("rpc", `✗ ${fn} failed`, enriched, "error");
          captureError(result.error, enriched);
          logger.error(`rpc:${fn} ${enriched.message ?? "failed"}`, enriched, result.error.stack);
          try { result.error.correlationId = correlationId; } catch {}
        } else {
          breadcrumb("rpc", `✓ ${fn}`, { correlationId, durationMs });
        }
        return onFulfilled ? onFulfilled(result) : result;
      }, onRejected);

    return builder;
  };
}
