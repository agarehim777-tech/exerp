import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useActivities(tenantId, { customerId, dealId, limit = 100 } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = supabase.from('crm_activities').select('*, customer:customers(id,name)').eq('tenant_id', tenantId);
    if (customerId) q = q.eq('customer_id', customerId);
    if (dealId) q = q.eq('deal_id', dealId);
    q = q.order('occurred_at', { ascending: false }).limit(limit);
    const { data } = await q;
    setItems(data || []);
    setLoading(false);
  }, [tenantId, customerId, dealId, limit]);

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

  const remove = async (id) => { await supabase.from('crm_activities').delete().eq('id', id); };

  return { items, loading, refresh: fetchAll, create, remove };
}
