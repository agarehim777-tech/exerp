import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

function computeTotals(items) {
  let subtotal = 0, vat = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.unit_price) || 0;
    const disc = Number(it.discount_pct) || 0;
    const vatRate = Number(it.vat_rate) || 0;
    const gross = qty * price * (1 - disc / 100);
    subtotal += gross;
    vat += gross * (vatRate / 100);
  }
  return {
    subtotal: Number(subtotal.toFixed(2)),
    vat_total: Number(vat.toFixed(2)),
    total: Number((subtotal + vat).toFixed(2)),
  };
}

export function useOrders(tenantId) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(id,name), items:order_items(*)')
      .eq('tenant_id', tenantId)
      .order('order_date', { ascending: false });
    if (error) setError(error);
    else setOrders(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`orders:${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async ({ items = [], ...header }) => {
    const totals = computeTotals(items);
    const { data: order, error } = await supabase
      .from('orders')
      .insert({ ...header, ...totals, tenant_id: tenantId })
      .select().single();
    if (error) throw error;

    if (items.length) {
      const rows = items.map((it, idx) => {
        const qty = Number(it.qty) || 0;
        const price = Number(it.unit_price) || 0;
        const disc = Number(it.discount_pct) || 0;
        const vatRate = Number(it.vat_rate) || 0;
        const gross = qty * price * (1 - disc / 100);
        const line_total = Number((gross * (1 + vatRate / 100)).toFixed(2));
        return {
          tenant_id: tenantId,
          order_id: order.id,
          product_id: it.product_id || null,
          line_no: idx + 1,
          description: it.description || null,
          qty, unit_price: price, discount_pct: disc, vat_rate: vatRate,
          line_total,
        };
      });
      const { error: itErr } = await supabase.from('order_items').insert(rows);
      if (itErr) throw itErr;
    }
    return order;
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
  };

  const updateHeader = async (id, patch) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) throw error;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
  };

  return { orders, loading, error, refresh: fetchAll, create, updateStatus, updateHeader, remove };
}
