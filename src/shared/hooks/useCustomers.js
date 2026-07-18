import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useCustomers(tenantId) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) setError(error);
    else setCustomers(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`customers:${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async (values) => {
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...values, tenant_id: tenantId })
      .select().single();
    if (error) throw error;
    return data;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase
      .from('customers').update(values).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  };

  return { customers, loading, error, refresh: fetchAll, create, update, remove };
}
