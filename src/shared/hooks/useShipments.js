import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useShipments(tenantId) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setShipments([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('sales_shipments')
      .select('*, order:orders(id,order_no,customer:customers(name))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setShipments(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel(`shipments:${tenantId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_shipments', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchAll]);

  const nextNumber = async () => {
    const yr = new Date().getFullYear();
    const prefix = `SH-${yr}-`;
    const { data } = await supabase
      .from('sales_shipments').select('shipment_no').eq('tenant_id', tenantId).like('shipment_no', `${prefix}%`)
      .order('shipment_no', { ascending: false }).limit(1);
    const last = data?.[0]?.shipment_no;
    const n = last ? parseInt(last.split('-')[2], 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  };

  const create = async ({ order_id, carrier, tracking_no, notes }) => {
    const shipment_no = await nextNumber();
    const { data, error } = await supabase
      .from('sales_shipments')
      .insert({ tenant_id: tenantId, order_id, shipment_no, carrier, tracking_no, notes })
      .select().single();
    if (error) throw error;
    return data;
  };

  const setStatus = async (id, status) => {
    const patch = { status };
    if (status === 'shipped') patch.shipped_at = new Date().toISOString();
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from('sales_shipments').update(patch).eq('id', id);
    if (error) throw error;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('sales_shipments').delete().eq('id', id);
    if (error) throw error;
  };

  return { shipments, loading, refresh: fetchAll, create, setStatus, remove };
}
