import { useCallback, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../integrations/supabase/client";

const TABLE = "tenant_collection_records";

export const recordKey = (item, index) => String(item?.id ?? item?.key ?? item?.code ?? `idx-${index}`);

export function rowToApp(row) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return { ...data, id: data.id ?? row.record_key };
}

export function appToRow(item, index, tenantId, collection) {
  return {
    tenant_id: tenantId,
    collection,
    record_key: recordKey(item, index),
    position: index,
    data: item,
  };
}

function signature(item, index) {
  return `${index}:${JSON.stringify(item)}`;
}

/**
 * Mirrors a snapshot-backed list (HR, credits, cash entries, finance accounts…)
 * into the `tenant_collection_records` table: each list item becomes its own
 * row, so records survive reloads and are no longer last-write-wins blobs.
 */
export function useCollectionSync({ tenantId, ready, collections, state, setState, onError }) {
  const names = useMemo(() => collections.slice().sort(), [collections]);
  const syncedRef = useRef(new Map());
  const hydratedRef = useRef(null);

  const hydrate = useCallback(async () => {
    if (!tenantId || !ready) return;
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("collection,record_key,position,data")
        .eq("tenant_id", tenantId)
        .in("collection", names)
        .order("position", { ascending: true })
        .limit(10000);
      if (error) throw error;

      const byCollection = new Map(names.map((name) => [name, []]));
      (data || []).forEach((row) => {
        if (!byCollection.has(row.collection)) return;
        byCollection.get(row.collection).push(rowToApp(row));
      });

      const next = {};
      names.forEach((name) => {
        const dbRows = byCollection.get(name) || [];
        // Browser/snapshot data is not an authoritative source. Legacy imports
        // must go through an explicit, reviewed migration instead of hydration.
        next[name] = dbRows;
      });

      const signed = new Map();
      names.forEach((name) => {
        signed.set(name, new Map((next[name] || []).map((item, index) => [recordKey(item, index), signature(item, index)])));
      });
      syncedRef.current = signed;
      hydratedRef.current = tenantId;
      setState((current) => ({ ...current, ...next }));
    } catch (error) {
      onError?.(error);
    }
  }, [names, onError, ready, setState, state, tenantId]);

  useEffect(() => {
    if (!tenantId || !ready) {
      hydratedRef.current = null;
      syncedRef.current = new Map();
      return;
    }
    if (hydratedRef.current === tenantId) return;
    hydrate();
  }, [hydrate, ready, tenantId]);

  useEffect(() => {
    if (!tenantId || !ready || hydratedRef.current !== tenantId) return;

    const upserts = [];
    const deletes = [];
    const nextSigned = new Map();

    names.forEach((name) => {
      const list = Array.isArray(state?.[name]) ? state[name] : [];
      const previous = syncedRef.current.get(name) || new Map();
      const current = new Map();
      list.forEach((item, index) => {
        const key = recordKey(item, index);
        const sig = signature(item, index);
        current.set(key, sig);
        if (previous.get(key) !== sig) upserts.push(appToRow(item, index, tenantId, name));
      });
      [...previous.keys()].forEach((key) => {
        if (!current.has(key)) deletes.push({ collection: name, record_key: key });
      });
      nextSigned.set(name, current);
    });

    if (!upserts.length && !deletes.length) return;
    syncedRef.current = nextSigned;

    (async () => {
      try {
        if (upserts.length) {
          const { error } = await supabase
            .from(TABLE)
            .upsert(upserts, { onConflict: "tenant_id,collection,record_key" });
          if (error) throw error;
        }
        for (const item of deletes) {
          const { error } = await supabase
            .from(TABLE)
            .delete()
            .eq("tenant_id", tenantId)
            .eq("collection", item.collection)
            .eq("record_key", item.record_key);
          if (error) throw error;
        }
      } catch (error) {
        onError?.(error);
      }
    })();
  }, [names, onError, ready, state, tenantId]);

  return { refresh: hydrate };
}
