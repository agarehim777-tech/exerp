import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';

const PRODUCTS_PAGE_SIZE = 500;

export function useProducts(tenantId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(PRODUCTS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (error) setError(error);
    else {
      const rows = data || [];
      setHasMore(rows.length > limit);
      setProducts(rows.slice(0, limit));
    }
    setLoading(false);
  }, [tenantId, limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + PRODUCTS_PAGE_SIZE), []);

  useRealtimeResync(tenantId, ['products'], fetchAll, { channelPrefix: 'products' });

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

  return { products, loading, error, hasMore, loadMore, refresh: fetchAll, create, update, remove };
}
