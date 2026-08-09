import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useProducts(tenantId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) setError(error);
    else setProducts(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`products:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async (values) => {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...values, tenant_id: tenantId })
      .select().single();
    if (error) throw error;
    setProducts((current) => current.some((item) => item.id === data.id) ? current : [data, ...current]);
    return data;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase
      .from('products').update(values).eq('id', id).select().single();
    if (error) throw error;
    setProducts((current) => current.map((item) => item.id === id ? data : item));
    return data;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    setProducts((current) => current.filter((item) => item.id !== id));
  };

  return { products, loading, error, refresh: fetchAll, create, update, remove };
}
