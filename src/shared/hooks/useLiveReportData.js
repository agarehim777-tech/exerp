import { useCallback, useEffect, useState } from "react";
import { emptyReportData, loadReportData, reportTables } from '../../services/reportData.js';
import { useRealtimeResync } from "./useRealtimeResync.js";
import { useTenantRequestScope } from './useTenantRequestScope.js';

export function useLiveReportData(tenantId) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [snapshot, setSnapshot] = useState(null);
  const current = snapshot?.scope === scope ? snapshot : null;

  const load = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    if (!isCurrent()) return;
    setSnapshot(previous => ({ scope, data: previous?.scope === scope ? previous.data : emptyReportData,
      loaded: previous?.scope === scope && previous.loaded, loading: true, error: null }));
    try {
      const data = await loadReportData(tenantId);
      if (isCurrent()) setSnapshot({ scope, data, loaded: true, loading: false, error: null });
    } catch (error) {
      if (isCurrent()) setSnapshot(previous => ({ ...previous, loading: false, error }));
    }
  }, [tenantId, scope, begin]);

  useEffect(() => { load(); }, [load]);
  const degraded = useRealtimeResync(tenantId, reportTables, load, { channelPrefix: "reports-live", debounceMs: 700 });
  return { ...(current?.data || emptyReportData), loading: Boolean(tenantId && (!current || current.loading)),
    loaded: Boolean(tenantId && current?.loaded), error: current?.error || null, degraded, refresh: load };
}
