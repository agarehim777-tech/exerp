import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { toLocalIsoDate } from '../../services/date.js';
import { useTenantRequestScope } from './useTenantRequestScope';

export function useSalesDashboard(tenantId, days = 30) {
  const { begin } = useTenantRequestScope(tenantId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setData(null); }, [tenantId]);
  const fetchIt = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    const iso = (d) => toLocalIsoDate(d);
    const { data: res, error } = await supabase.rpc('sales_dashboard', {
      _tenant: tenantId, _from: iso(from), _to: iso(to),
    });
    if (!isCurrent()) return;
    if (error) setError(error); else { setError(null); setData(res); }
    setLoading(false);
  }, [tenantId, days, begin]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`sales-dash:${tenantId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, fetchIt)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchIt]);

  return { data, loading, error, refresh: fetchIt };
}
