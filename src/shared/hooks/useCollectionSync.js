import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useTenantRequestScope } from "./useTenantRequestScope";

const TABLE = "tenant_collection_records";
export const recordKey = (item, index) => String(item?.id ?? item?.key ?? item?.code ?? `idx-${index}`);

export function rowToApp(row) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return { ...data, id: data.id ?? row.record_key };
}

export function appToRow(item, index, tenantId, collection) {
  return { tenant_id: tenantId, collection, record_key: recordKey(item, index), position: index, data: item };
}

const signature = (row) => JSON.stringify([row.position, row.data]);
const identity = (row) => JSON.stringify([row.collection, row.record_key]);

export function collectionRows(state, names, tenantId) {
  return new Map(names.flatMap(name => (Array.isArray(state?.[name]) ? state[name] : [])
    .map((item, index) => {
      const row = appToRow(item, index, tenantId, name);
      return [identity(row), row];
    })));
}

export function collectionChanges(baseline, next) {
  return {
    upserts: [...next].filter(([key, row]) => !baseline.has(key) || signature(row) !== signature(baseline.get(key))).map(([, row]) => row),
    deletes: [...baseline].filter(([key]) => !next.has(key)).map(([, row]) => row),
  };
}

export function useCollectionSync({ tenantId, ready, collections, state, setState, onError }) {
  const { scope } = useTenantRequestScope(tenantId);
  const names = useMemo(() => collections.slice().sort(), [collections]);
  const latest = useRef(state);
  latest.current = state;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const sessionRef = useRef(null);
  const flushTimer = useRef(null);
  const [status, setStatus] = useState({ phase: "idle", error: null });

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.alive || session.scope !== scope || !session.hydrated || session.busy) return;
    session.busy = true;
    setStatus({ phase: "saving", error: null });
    try {
      // A single writer drains newer edits; only acknowledged rows advance the baseline.
      while (session.alive) {
        const next = collectionRows(latest.current, names, tenantId);
        const { upserts, deletes } = collectionChanges(session.baseline, next);
        if (!upserts.length && !deletes.length) break;
        if (upserts.length) {
          const { error } = await supabase.from(TABLE).upsert(upserts, { onConflict: "tenant_id,collection,record_key" });
          if (error) throw error;
          if (!session.alive) return;
          upserts.forEach(row => session.baseline.set(identity(row), row));
        }
        for (const row of deletes) {
          if (!session.alive) return;
          const { error } = await supabase.from(TABLE).delete()
            .eq("tenant_id", tenantId).eq("collection", row.collection).eq("record_key", row.record_key);
          if (error) throw error;
          session.baseline.delete(identity(row));
        }
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

  const hydrate = useCallback(async (session) => {
    if (!session?.alive || session.busy) return;
    session.busy = true;
    const beforeRead = collectionRows(latest.current, names, tenantId);
    setStatus({ phase: "loading", error: null });
    try {
      const rows = [];
      for (let offset = 0; ;) {
        const { data, error, count } = await supabase.from(TABLE).select("collection,record_key,position,data", { count: "exact" })
          .eq("tenant_id", tenantId).in("collection", names)
          .order("collection").order("position").order("record_key").range(offset, offset + 499);
        if (error) throw error;
        if (!session.alive) return;
        if (!Number.isInteger(count)) throw new Error("Collection read requires an exact count");
        if (!data?.length && offset < count) throw new Error("Collection read ended before all records were loaded");
        rows.push(...(data || []));
        offset += data?.length || 0;
        if (offset >= count) break;
      }
      const next = Object.fromEntries(names.map(name => [name, []]));
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
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    };
  }, [scope, tenantId, ready, hydrate]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!ready || !session?.hydrated || flushTimer.current !== null) return;
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

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  return { ...status, ready: Boolean(ready && sessionRef.current?.scope === scope && sessionRef.current.hydrated), retry, refresh: retry };
}
