import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

function isMissingRpc(error) {
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || /function .* does not exist|schema cache/i.test(error?.message || '');
}

function lineValues(item, index, tenantId, orderId) {
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const discount = Number(item.discount_pct) || 0;
  const vatRate = Number(item.vat_rate) || 0;
  const net = qty * unitPrice * (1 - discount / 100);
  return {
    tenant_id: tenantId,
    order_id: orderId,
    product_id: item.product_id || null,
    line_no: item.line_no || index + 1,
    description: item.description || null,
    qty,
    unit_price: unitPrice,
    discount_pct: discount,
    vat_rate: vatRate,
    line_total: Number((net * (1 + vatRate / 100)).toFixed(2)),
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
      .channel(`orders:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
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
    const { data: orderId, error } = await supabase.rpc('create_sales_order', {
      _tenant_id: tenantId,
      _order_no: header.order_no,
      _customer_id: header.customer_id || null,
      _order_date: header.order_date || new Date().toISOString().slice(0, 10),
      _currency: header.currency || 'AZN',
      _notes: header.notes || null,
      _items: items,
    });
    if (!error) {
      await fetchAll();
      return { id: orderId };
    }
    if (!isMissingRpc(error)) throw error;

    // Transitional path for environments where the core-operations migration
    // has not been deployed yet. Remove after all environments report v2.
    const rows = items.map((item, index) => lineValues(item, index, tenantId, null));
    const subtotal = rows.reduce((sum, item) => {
      const net = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      return sum + net;
    }, 0);
    const vatTotal = rows.reduce((sum, item) => {
      const net = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      return sum + net * item.vat_rate / 100;
    }, 0);
    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        ...header,
        status: header.status || 'draft',
        subtotal: Number(subtotal.toFixed(2)),
        vat_total: Number(vatTotal.toFixed(2)),
        total: Number((subtotal + vatTotal).toFixed(2)),
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    const fallbackRows = items.map((item, index) => lineValues(item, index, tenantId, order.id));
    const { error: itemError } = await supabase.from('order_items').insert(fallbackRows);
    if (itemError) {
      await supabase.from('orders').delete().eq('id', order.id).eq('tenant_id', tenantId);
      throw itemError;
    }
    await fetchAll();
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
