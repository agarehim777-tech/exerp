import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useSalesDashboard(tenantId, days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIt = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    const iso = (d) => d.toISOString().slice(0, 10);
    const { data: res, error } = await supabase.rpc('sales_dashboard', {
      _tenant: tenantId, _from: iso(from), _to: iso(to),
    });
    if (error) setError(error); else setData(res);
    setLoading(false);
  }, [tenantId, days]);

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
