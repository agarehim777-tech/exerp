import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useStock(tenantId) {
  const [warehouses, setWarehouses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [wh, bal, mov] = await Promise.all([
      supabase.from('warehouses').select('*').eq('tenant_id', tenantId).order('name'),
      supabase
        .from('stock_balances')
        .select('*, product:products(id,name,sku,unit,price), warehouse:warehouses(id,name,code)')
        .eq('tenant_id', tenantId),
      supabase
        .from('stock_movements')
        .select('*, product:products(id,name,sku), warehouse:warehouses(id,name)')
        .eq('tenant_id', tenantId)
        .order('moved_at', { ascending: false })
        .limit(200),
    ]);
    const firstError = wh.error || bal.error || mov.error;
    if (firstError) setError(firstError);
    else setError(null);
    setWarehouses(wh.data || []);
    setBalances(bal.data || []);
    setMovements(mov.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return undefined;
    const channel = supabase
      .channel(`stock:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouses', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const createWarehouse = async (payload) => {
    const { error: err } = await supabase.from('warehouses').insert({ ...payload, tenant_id: tenantId });
    if (err) throw err;
    await fetchAll();
  };

  const removeWarehouse = async (id) => {
    const { error: err } = await supabase.from('warehouses').delete().eq('id', id);
    if (err) throw err;
    await fetchAll();
  };

  const addMovement = async (payload) => {
    const { error: err } = await supabase.from('stock_movements').insert({
      ...payload,
      qty: Number(payload.qty) || 0,
      unit_cost: Number(payload.unit_cost) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    await fetchAll();
  };

  const setReorderPoint = async (balanceId, value) => {
    const { error: err } = await supabase
      .from('stock_balances')
      .update({ reorder_point: Number(value) || 0 })
      .eq('id', balanceId);
    if (err) throw err;
    await fetchAll();
  };

  return {
    warehouses, balances, movements, loading, error,
    refresh: fetchAll, createWarehouse, removeWarehouse, addMovement, setReorderPoint,
  };
}
