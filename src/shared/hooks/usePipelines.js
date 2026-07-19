import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function usePipelines(tenantId) {
  const [pipelines, setPipelines] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [{ data: p, error: pe }, { data: s, error: se }] = await Promise.all([
      supabase.from('crm_pipelines').select('*').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('crm_stages').select('*').eq('tenant_id', tenantId).order('sort_order'),
    ]);
    if (pe || se) setError(pe || se);
    else { setPipelines(p || []); setStages(s || []); }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`pipelines:${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_stages', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_pipelines', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchAll]);

  const seedDefault = async () => {
    const { data, error } = await supabase.rpc('seed_default_crm_pipeline', { _tenant: tenantId });
    if (error) throw error;
    await fetchAll();
    return data;
  };

  const activePipeline = pipelines.find(p => p.is_default) || pipelines[0] || null;
  const stagesFor = (pid) => stages.filter(s => s.pipeline_id === pid);

  return { pipelines, stages, activePipeline, stagesFor, loading, error, refresh: fetchAll, seedDefault };
}
