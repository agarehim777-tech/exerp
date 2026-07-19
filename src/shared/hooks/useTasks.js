import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useTasks(tenantId, { customerId, dealId, mineOnly = false } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    let q = supabase.from('crm_tasks').select('*, customer:customers(id,name)').eq('tenant_id', tenantId);
    if (customerId) q = q.eq('customer_id', customerId);
    if (dealId) q = q.eq('deal_id', dealId);
    if (mineOnly && user) q = q.eq('assigned_to', user.id);
    q = q.order('done').order('due_at', { ascending: true, nullsFirst: false });
    const { data } = await q;
    setItems(data || []);
    setLoading(false);
  }, [tenantId, customerId, dealId, mineOnly]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`tasks:${tenantId}:${Math.random().toString(36).slice(2,10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_tasks', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchAll]);

  const create = async (values) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_tasks').insert({
      ...values, tenant_id: tenantId, created_by: user?.id, assigned_to: values.assigned_to || user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase.from('crm_tasks').update(values).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  const toggle = async (id, done) => update(id, { done });
  const remove = async (id) => { await supabase.from('crm_tasks').delete().eq('id', id); };

  return { items, loading, refresh: fetchAll, create, update, toggle, remove };
}
