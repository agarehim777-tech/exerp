import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useDeals(tenantId, pipelineId) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId || !pipelineId) { setDeals([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('crm_deals')
      .select('*, customer:customers(id,name,email,phone)')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', pipelineId)
      .order('sort_order');
    setDeals(data || []);
    setLoading(false);
  }, [tenantId, pipelineId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`deals:${tenantId}`)
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

  return { deals, loading, refresh: fetchAll, create, update, move, remove };
}
