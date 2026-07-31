import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useAccountingPeriods(tenantId) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('accounting_periods')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false });
    setError(err || null);
    setPeriods(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return undefined;
    const channel = supabase
      .channel(`periods:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounting_periods', filter: `tenant_id=eq.${tenantId}` },
        fetchAll,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = useCallback(async (payload) => {
    const { error: err } = await supabase.from('accounting_periods').insert({
      tenant_id: tenantId,
      name: payload.name,
      start_date: payload.start_date,
      end_date: payload.end_date,
      status: payload.status || 'open',
    });
    if (err) throw err;
    await fetchAll();
  }, [tenantId, fetchAll]);

  const setStatus = useCallback(async (id, status) => {
    const { error: err } = await supabase.from('accounting_periods').update({ status }).eq('id', id);
    if (err) throw err;
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase.from('accounting_periods').delete().eq('id', id);
    if (err) throw err;
    await fetchAll();
  }, [fetchAll]);

  return { periods, loading, error, refresh: fetchAll, create, setStatus, remove };
}
