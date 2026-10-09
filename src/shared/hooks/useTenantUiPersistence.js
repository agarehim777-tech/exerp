import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { pickUiPreferences, stripOperationalCollections, withoutOperationalData, writeTenantUiCache } from '../state/tenantPersistence.js';
import { useTenantRequestScope } from './useTenantRequestScope.js';

export function useTenantUiPersistence({ tenantId, userId, state, setState, hydrateState, localKey, schemaVersion, onWarning, onError }) {
  const { scope } = useTenantRequestScope(tenantId);
  const [loadedTenant, setLoadedTenant] = useState(null);
  const ready = Boolean(tenantId && loadedTenant === scope);
  const snapshotUnavailable = useRef(false);
  const saveTimer = useRef(null);
  const writer = useRef(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
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
        setState(hydrateState(withoutOperationalData(snapshot)));
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
    session.pending = {
      tenant_id: tenantId, state: JSON.parse(snapshotJson), schema_version: schemaVersion,
      updated_at: new Date().toISOString(), updated_by: userId,
    };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!session.alive || session.busy) return;
      session.busy = true;
      try {
        // Only one snapshot write may be in flight; later edits replace the queued payload.
        while (session.alive && session.pending) {
          const payload = session.pending;
          session.pending = null;
          const { error } = await supabase.from('tenant_state_snapshots').upsert(payload, { onConflict: 'tenant_id' });
          if (error) {
            session.pending ||= payload;
            throw error;
          }
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

