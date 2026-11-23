import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useTenantRequestScope } from './useTenantRequestScope';

export function useDeals(tenantId, pipelineId) {
  const { begin } = useTenantRequestScope(tenantId);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setDeals([]); }, [tenantId]);
  const fetchAll = useCallback(async () => {
    if (!tenantId || !pipelineId) { setDeals([]); setError(null); return; }
    const isCurrent = begin();
    setLoading(true);
    const { data, error: readError } = await supabase
      .from('crm_deals')
      .select('*, customer:customers(id,name,email,phone)')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', pipelineId)
      .order('sort_order');
    if (!isCurrent()) return;
    setError(readError || null);
    setDeals(data || []);
    setLoading(false);
  }, [tenantId, pipelineId, begin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`deals:${tenantId}:${Math.random().toString(36).slice(2,10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_deals', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchAll]);

  const create = async (values) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_deals').insert({
      ...values, tenant_id: tenantId, pipeline_id: pipelineId, owner_id: user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase.from('crm_deals').update(values).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  const move = async (id, stageId, status = 'open') => {
    return update(id, { stage_id: stageId, status });
  };

  const remove = async (id) => {
    const { error } = await supabase.from('crm_deals').delete().eq('id', id);
    if (error) throw error;
  };

  return { deals, loading, error, refresh: fetchAll, create, update, move, remove };
}
