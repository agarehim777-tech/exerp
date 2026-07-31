import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

// Faktura kəsimi üçün mənbələr: satış sifarişləri və layihələr.
export function useBillingSources(tenantId) {
  const [orders, setOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [ordersRes, projectsRes, invoicesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, customer:customers(id,name), items:order_items(*)')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
        .order('order_date', { ascending: false }),
      supabase
        .from('projects')
        .select('id,name,budget,status,start_date,end_date')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('sales_invoices')
        .select('id,order_id,notes,status')
        .eq('tenant_id', tenantId),
    ]);

    const err = ordersRes.error || projectsRes.error || invoicesRes.error;
    setError(err || null);

    const invoices = invoicesRes.data || [];
    const billedOrderIds = new Set(invoices.filter((i) => i.order_id && i.status !== 'cancelled').map((i) => i.order_id));
    const billedProjectRefs = new Set(
      invoices
        .filter((i) => i.status !== 'cancelled')
        .map((i) => (i.notes || '').match(/\[project:([0-9a-f-]{36})\]/i)?.[1])
        .filter(Boolean),
    );

    setOrders((ordersRes.data || []).map((o) => ({ ...o, billed: billedOrderIds.has(o.id) })));
    setProjects((projectsRes.data || []).map((p) => ({ ...p, billed: billedProjectRefs.has(p.id) })));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { orders, projects, loading, error, refresh: fetchAll };
}
