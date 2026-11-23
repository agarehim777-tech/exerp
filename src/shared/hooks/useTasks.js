import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { readAllRows } from '../../services/readAllRows.js';
import { useTenantRequestScope } from './useTenantRequestScope';

export function useTasks(tenantId, { customerId, dealId, mineOnly = false } = {}) {
  const { begin } = useTenantRequestScope(tenantId);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setItems([]); }, [tenantId]);
  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    // Paged: a tenant's tasks can exceed the 1000 rows PostgREST returns per request.
    const { data, error: readError } = await readAllRows(() => {
      let q = supabase.from('crm_tasks').select('*, customer:customers(id,name)').eq('tenant_id', tenantId);
      if (customerId) q = q.eq('customer_id', customerId);
      if (dealId) q = q.eq('deal_id', dealId);
      if (mineOnly && user) q = q.eq('assigned_to', user.id);
      return q.order('done').order('due_at', { ascending: true, nullsFirst: false }).order('id');
    });
    if (!isCurrent()) return;
    setError(readError || null);
    if (!readError) setItems(data || []);
    setLoading(false);
  }, [tenantId, customerId, dealId, mineOnly, begin]);

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
    await fetchAll();
    return data;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase.from('crm_tasks').update(values).eq('id', id).select().single();
    if (error) throw error;
    await fetchAll();
    return data;
  };

  const toggle = async (id, done) => update(id, { done });
  // A refused delete (RLS, viewer role) must not look like success.
  const remove = async (id) => {
    const { error: deleteError } = await supabase.from('crm_tasks').delete().eq('id', id);
    if (deleteError) throw deleteError;
    await fetchAll();
  };

  return { items, loading, error, refresh: fetchAll, create, update, toggle, remove };
}
