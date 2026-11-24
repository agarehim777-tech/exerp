import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { pickUiPreferences, stripOperationalCollections, withoutOperationalData, writeTenantUiCache } from '../state/tenantPersistence.js';
import { useTenantRequestScope } from './useTenantRequestScope.js';

const keyJson = (value) => JSON.stringify(value ?? null);

/** Top-level keys of `next` whose JSON differs from `saved` (key -> JSON of the last server value). */
export function changedSnapshotKeys(next, saved) {
  const patch = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (saved[key] !== keyJson(value)) patch[key] = value ?? null;
  }
  return patch;
}

export function snapshotKeyJson(snapshot) {
  return Object.fromEntries(Object.entries(snapshot || {}).map(([key, value]) => [key, keyJson(value)]));
}

// The snapshot is one JSON row per tenant. Writes go through save_tenant_state_patch: only the changed
// top-level keys are sent, the server merges them and checks each key against its module's edit
// permission (a member can save support tickets or messages without settings access), so users working
// in different modules no longer overwrite each other.
export function useTenantUiPersistence({ tenantId, userId, state, setState, hydrateState, localKey, schemaVersion, onWarning, onError }) {
  const { scope } = useTenantRequestScope(tenantId);
  const [loadedTenant, setLoadedTenant] = useState(null);
  const ready = Boolean(tenantId && loadedTenant === scope);
  const snapshotUnavailable = useRef(false);
  const saveTimer = useRef(null);
  const writer = useRef(null);
  const savedKeys = useRef({});
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const warningHandler = useRef(onWarning);
  warningHandler.current = onWarning;
  const snapshotJson = JSON.stringify(stripOperationalCollections(state));
  const uiJson = JSON.stringify(pickUiPreferences(state));

  useEffect(() => {
    let cancelled = false;
    setLoadedTenant(null);
    setState(hydrateState(withoutOperationalData({})));
    if (!tenantId) return () => { cancelled = true; };
    supabase.from('tenant_state_snapshots').select('state,schema_version').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        snapshotUnavailable.current = Boolean(error);
        let snapshot = data?.state || {};
        if (error) {
          try { snapshot = pickUiPreferences(JSON.parse(window.localStorage.getItem(`${localKey}.${tenantId}`) || '{}')); } catch { snapshot = {}; }
          onWarning?.(error);
        }
        const hydrated = hydrateState(withoutOperationalData(snapshot));
        // Baseline = what the page starts with, so only later user changes are sent.
        savedKeys.current = snapshotKeyJson(stripOperationalCollections(hydrated));
        setState(hydrated);
        setLoadedTenant(scope);
      }).catch((error) => {
        if (!cancelled) onError?.(error);
      });
    return () => { cancelled = true; };
  }, [tenantId, scope, hydrateState, localKey, onWarning, onError, setState]);

  useEffect(() => {
    if (!ready) return undefined;
    try { writeTenantUiCache(window.localStorage, `${localKey}.${tenantId}`, JSON.parse(uiJson)); }
    catch (error) { onWarning?.(error); }
  }, [tenantId, ready, uiJson, localKey, onWarning]);

  useEffect(() => {
    const session = { alive: true, busy: false, pending: null };
    writer.current = session;
    return () => {
      session.alive = false;
      window.clearTimeout(saveTimer.current);
    };
  }, [scope, userId, ready]);

  useEffect(() => {
    if (!tenantId || !userId || !ready || snapshotUnavailable.current) return undefined;
    const session = writer.current;
    const patch = changedSnapshotKeys(JSON.parse(snapshotJson), savedKeys.current);
    if (!Object.keys(patch).length) return undefined;
    session.pending = { ...(session.pending || {}), ...patch };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!session.alive || session.busy) return;
      session.busy = true;
      try {
        // Only one patch may be in flight; later edits are merged into the queued one.
        while (session.alive && session.pending) {
          const payload = session.pending;
          session.pending = null;
          const { data, error } = await supabase.rpc('save_tenant_state_patch', {
            _tenant_id: tenantId, _patch: payload, _schema_version: schemaVersion,
          });
          if (error) {
            session.pending = { ...payload, ...(session.pending || {}) };
            throw error;
          }
          if (!session.alive) break;
          // Denied keys (no edit right on that module) are not retried until they change again.
          Object.entries(payload).forEach(([key, value]) => { savedKeys.current[key] = keyJson(value); });
          const result = /** @type {{ denied?: string[] } | null} */ (data);
          const denied = Array.isArray(result?.denied) ? result.denied : [];
          if (denied.length) warningHandler.current?.(new Error(`tenant_state_denied: ${denied.join(', ')}`));
        }
      } catch (error) {
        if (session.alive) errorHandler.current?.(error);
      } finally {
        session.busy = false;
      }
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [tenantId, userId, ready, snapshotJson, schemaVersion]);

  return { ready, snapshotUnavailable };
}

