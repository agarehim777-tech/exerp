import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useTenantRequestScope } from './useTenantRequestScope';

export function useActivities(tenantId, { customerId, dealId, limit = 100 } = {}) {
  const { begin } = useTenantRequestScope(tenantId);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setItems([]); }, [tenantId]);
  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    let q = supabase.from('crm_activities').select('*, customer:customers(id,name)').eq('tenant_id', tenantId);
    if (customerId) q = q.eq('customer_id', customerId);
    if (dealId) q = q.eq('deal_id', dealId);
    q = q.order('occurred_at', { ascending: false }).limit(limit);
    const { data, error: readError } = await q;
    if (!isCurrent()) return;
    setError(readError || null);
    if (!readError) setItems(data || []);
    setLoading(false);
  }, [tenantId, customerId, dealId, limit, begin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`activities:${tenantId}:${customerId||'all'}:${Math.random().toString(36).slice(2,10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_activities', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, customerId, fetchAll]);

  const create = async (values) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_activities').insert({
      ...values, tenant_id: tenantId, owner_id: user?.id, occurred_at: values.occurred_at || new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    return data;
  };

  // A refused delete (RLS, viewer role) must not look like success.
  const remove = async (id) => {
    const { error: deleteError } = await supabase.from('crm_activities').delete().eq('id', id);
    if (deleteError) throw deleteError;
    await fetchAll();
  };

  return { items, loading, error, refresh: fetchAll, create, remove };
}
