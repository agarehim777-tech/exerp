import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { stripOperationalCollections, withoutOperationalData, writeTenantUiCache } from '../state/tenantPersistence.js';

export function useTenantUiPersistence({ tenantId, userId, state, setState, hydrateState, localKey, schemaVersion, onWarning, onError }) {
  const [ready, setReady] = useState(false);
  const snapshotUnavailable = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!tenantId) return () => { cancelled = true; };
    supabase.from('tenant_state_snapshots').select('state,schema_version').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        snapshotUnavailable.current = Boolean(error);
        let snapshot = data?.state || {};
        if (error) {
          try { snapshot = JSON.parse(window.localStorage.getItem(`${localKey}.${tenantId}`) || '{}'); } catch { snapshot = {}; }
          onWarning?.(error);
        }
        setState(hydrateState(withoutOperationalData(snapshot)));
        setReady(true);
      });
    return () => { cancelled = true; };
  }, [tenantId, hydrateState, localKey, onWarning, setState]);

  useEffect(() => {
    try { writeTenantUiCache(window.localStorage, tenantId ? `${localKey}.${tenantId}` : localKey, state); }
    catch (error) { onWarning?.(error); }
    if (!tenantId || !userId || !ready || snapshotUnavailable.current) return undefined;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      supabase.from('tenant_state_snapshots').upsert({
        tenant_id: tenantId, state: stripOperationalCollections(state), schema_version: schemaVersion,
        updated_at: new Date().toISOString(), updated_by: userId,
      }, { onConflict: 'tenant_id' }).then(({ error }) => { if (error) onError?.(error); });
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [tenantId, userId, ready, state, localKey, schemaVersion, onWarning, onError]);

  return { ready, snapshotUnavailable };
}

