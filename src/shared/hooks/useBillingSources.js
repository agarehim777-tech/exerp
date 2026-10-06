import { useCallback, useEffect, useState } from 'react';
import { readBillingSources } from '../../services/billingRead.js';
import { useTenantRequestScope } from './useTenantRequestScope.js';

// Faktura kəsimi üçün mənbələr: satış sifarişləri və layihələr.
export function useBillingSources(tenantId) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [loadedScope, setLoadedScope] = useState(null);
  const [orders, setOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    try {
    const data = await readBillingSources(tenantId, isCurrent);
    if (!data || !isCurrent()) return;
    setError(null);
    const { invoices } = data;
    const billedOrderIds = new Set(invoices.filter((i) => i.order_id && i.status !== 'cancelled').map((i) => i.order_id));
    const billedProjectRefs = new Set(
      invoices
        .filter((i) => i.status !== 'cancelled')
        .map((i) => (i.notes || '').match(/\[project:([0-9a-f-]{36})\]/i)?.[1])
        .filter(Boolean),
    );

    setOrders(data.orders.map((o) => ({ ...o, billed: billedOrderIds.has(o.id) })));
    setProjects(data.projects.map((p) => ({ ...p, billed: billedProjectRefs.has(p.id) })));
    setLoadedScope(scope);
    } catch (err) { if (isCurrent()) { setError(err); setLoadedScope(null); } }
    finally { if (isCurrent()) setLoading(false); }
  }, [tenantId, scope, begin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loaded = Boolean(tenantId && loadedScope === scope);
  return { orders: loaded ? orders : [], projects: loaded ? projects : [], loading, error, refresh: fetchAll };
}
