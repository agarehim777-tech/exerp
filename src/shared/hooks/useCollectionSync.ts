import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useTenantRequestScope } from "./useTenantRequestScope";
import type { Dispatch, SetStateAction } from "react";
import type { AppRecord, CollectionRow } from "../adapters/dedicatedCollections";
import { definitionFor, fromDedicatedRow, toDedicatedRow } from "../adapters/dedicatedCollections";
import type { PostgrestError } from "@supabase/supabase-js";

interface WireResult { data: Record<string, unknown>[] | null; error: PostgrestError | null; count: number | null }
interface CollectionQuery extends PromiseLike<WireResult> {
  select(columns: string, options: { count: "exact" }): CollectionQuery;
  upsert(rows: Record<string, unknown>[], options: { onConflict: string }): CollectionQuery;
  delete(): CollectionQuery;
  eq(column: string, value: string): CollectionQuery;
  order(column: string): CollectionQuery;
  range(start: number, end: number): CollectionQuery;
}
const tableFor = (name: string) => supabase.from(definitionFor(name).table as "employees") as unknown as CollectionQuery;

export const recordKey = (item: AppRecord, index: number) => String(item?.id ?? item?.key ?? item?.code ?? `idx-${index}`);

export function rowToApp(row: Pick<CollectionRow, "data" | "record_key">) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return { ...data, id: data.id ?? row.record_key };
}

export function appToRow(item: AppRecord, index: number, tenantId: string, collection: string): CollectionRow {
  return { tenant_id: tenantId, collection, record_key: recordKey(item, index), position: index, data: item };
}

const signature = (row: CollectionRow) => JSON.stringify([row.position, row.data]);
const identity = (row: CollectionRow) => JSON.stringify([row.collection, row.record_key]);

type AppState = Record<string, unknown>;
export function collectionRows(state: AppState, names: string[], tenantId: string): Map<string, CollectionRow> {
  return new Map(names.flatMap(name => (Array.isArray(state?.[name]) ? state[name] : [])
    .map((item: AppRecord, index: number) => {
      const row = appToRow(item, index, tenantId, name);
      return [identity(row), row];
    })));
}

export function collectionChanges(baseline: Map<string, CollectionRow>, next: Map<string, CollectionRow>) {
  return {
    upserts: [...next].filter(([key, row]) => { const previous = baseline.get(key); return !previous || signature(row) !== signature(previous); }).map(([, row]) => row),
    deletes: [...baseline].filter(([key]) => !next.has(key)).map(([, row]) => row),
  };
}

interface SyncOptions { tenantId: string | null; ready: boolean; collections: string[]; state: AppState; setState: Dispatch<SetStateAction<AppState>>; onError?: (error: unknown) => void }
interface Session { scope: object; alive: boolean; hydrated: boolean; busy: boolean; baseline: Map<string, CollectionRow> }
export function useCollectionSync({ tenantId, ready, collections, state, setState, onError }: SyncOptions) {
  const { scope } = useTenantRequestScope(tenantId);
  const names = useMemo(() => collections.slice().sort(), [collections]);
  const latest = useRef(state);
  latest.current = state;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const sessionRef = useRef<Session | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<{ phase: string; error: unknown }>({ phase: "idle", error: null });

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (!tenantId || !session?.alive || session.scope !== scope || !session.hydrated || session.busy) return;
    session.busy = true;
    setStatus({ phase: "saving", error: null });
    try {
      // A single writer drains newer edits; only acknowledged rows advance the baseline.
      while (session.alive) {
        const next = collectionRows(latest.current, names, tenantId);
        const { upserts, deletes } = collectionChanges(session.baseline, next);
        if (!upserts.length && !deletes.length) break;
        const { error } = await supabase.rpc('apply_collection_changes' as never, {
          _tenant: tenantId,
          _changes: [
            ...upserts.map(row => ({ table: definitionFor(row.collection).table, operation: 'upsert', row: toDedicatedRow(row) })),
            ...deletes.map(row => ({ table: definitionFor(row.collection).table, operation: 'delete', row: { record_key: row.record_key } })),
          ],
        } as never);
        if (error) throw error;
        if (!session.alive) return;
        upserts.forEach(row => session.baseline.set(identity(row), row));
        deletes.forEach(row => session.baseline.delete(identity(row)));
      }
      if (session.alive) setStatus({ phase: "saved", error: null });
    } catch (error) {
      if (session.alive) {
        setStatus({ phase: "error", error });
        errorHandler.current?.(error);
      }
    } finally {
      session.busy = false;
    }
  }, [scope, names, tenantId]);

  const hydrate = useCallback(async (session: Session) => {
    if (!tenantId || !session?.alive || session.busy) return;
    session.busy = true;
    const beforeRead = collectionRows(latest.current, names, tenantId);
    setStatus({ phase: "loading", error: null });
    try {
      const rows: CollectionRow[] = [];
      // Bound each scan to one indexed collection; do not repeatedly count and
      // sort every collection while loading later pages of a large tenant.
      for (const name of names) {
        for (let offset = 0; ;) {
          const { data, error, count } = await tableFor(name).select("*", { count: "exact" })
            .eq("tenant_id", tenantId)
            .order("sort_position").order("record_key").range(offset, offset + 499);
          if (error) throw error;
          if (!session.alive) return;
          if (typeof count !== 'number' || !Number.isInteger(count)) throw new Error("Collection read requires an exact count");
          if (!data?.length && offset < count) throw new Error("Collection read ended before all records were loaded");
          rows.push(...(data || []).map(row => fromDedicatedRow(row, name)));
          offset += data?.length || 0;
          if (offset >= count) break;
        }
      }
      const next: Record<string, AppRecord[]> = Object.fromEntries(names.map(name => [name, []]));
      rows.forEach(row => { if (next[row.collection]) next[row.collection].push(rowToApp(row)); });
      session.baseline = collectionRows(next, names, tenantId);
      // Preserve edits made during the read, without backfilling unchanged browser rows.
      const pending = collectionChanges(beforeRead, collectionRows(latest.current, names, tenantId));
      const merged = new Map(session.baseline);
      pending.deletes.forEach(row => merged.delete(identity(row)));
      pending.upserts.forEach(row => {
        const key = identity(row);
        const original = beforeRead.get(key);
        if (!session.baseline.has(key) && original && JSON.stringify(original.data) === JSON.stringify(row.data)) return;
        merged.set(key, row);
      });
      names.forEach(name => {
        next[name] = [...merged.values()].filter(row => row.collection === name)
          .sort((a, b) => a.position - b.position).map(rowToApp);
      });
      session.hydrated = true;
      latest.current = { ...latest.current, ...next };
      setState(current => session.alive ? { ...current, ...next } : current);
      setStatus({ phase: "saved", error: null });
    } catch (error) {
      if (session.alive) {
        setStatus({ phase: "error", error });
        errorHandler.current?.(error);
      }
    } finally {
      session.busy = false;
    }
  }, [names, tenantId, setState]);

  useEffect(() => {
    const session = { scope, alive: true, hydrated: false, busy: false, baseline: new Map() };
    sessionRef.current = session;
    if (tenantId && ready) hydrate(session);
    return () => {
      session.alive = false;
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
      flushTimer.current = null;
    };
  }, [scope, tenantId, ready, hydrate]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!tenantId || !ready || !session?.hydrated || flushTimer.current !== null) return;
    const changes = collectionChanges(session.baseline, collectionRows(state, names, tenantId));
    if (!changes.upserts.length && !changes.deletes.length) return;
    // Background reads must not postpone an already queued user edit indefinitely.
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, 400);
  }, [state, ready, flush, names, tenantId]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (!ready || !tenantId || session?.scope !== scope) return;
    return session.hydrated ? flush() : hydrate(session);
  }, [scope, ready, tenantId, flush, hydrate]);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (!ready || !tenantId || session?.scope !== scope || session.busy) return;
    await flush();
    if (!session.alive) return;
    const pending = collectionChanges(session.baseline, collectionRows(latest.current, names, tenantId));
    if (pending.upserts.length || pending.deletes.length) return;
    await hydrate(session);
  }, [scope, ready, tenantId, names, flush, hydrate]);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  return { ...status, ready: Boolean(ready && sessionRef.current?.scope === scope && sessionRef.current?.hydrated), retry, refresh };
}
