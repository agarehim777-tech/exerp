import { useCallback, useEffect, useState } from 'react';
import { readAllRows } from '../../services/readAllRows.js';
import { supabase } from '../../integrations/supabase/client';
import { buildOperationalHealth } from '../lib/operationalHealth.js';
import { useTenantRequestScope } from './useTenantRequestScope';

export function useOperationalHealth(tenantId) {
  const { begin } = useTenantRequestScope(tenantId);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setReport(null); }, [tenantId]);

  const refresh = useCallback(async () => {
    if (!tenantId) return setReport(null);
    const isCurrent = begin();
    setLoading(true);
    setError('');
    try {
      const [orders, credits, cash, reservations, balances, invoices, deliveries, accountingEvents] = await Promise.all([
        readAllRows(() => supabase.from('orders').select('id,order_no,status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('credit_contracts').select('id,order_id,contract_no,status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('cash_transactions').select('id,category,reference_type,reference_id,reference,description,reversal_of').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('stock_reservations').select('id,order_id,warehouse_id,product_id,quantity,status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('stock_balances').select('warehouse_id,product_id,reserved').eq('tenant_id', tenantId).order('warehouse_id').order('product_id')),
        readAllRows(() => supabase.from('sales_invoices').select('id,invoice_no,order_id,status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('deliveries').select('id,delivery_no,order_id,status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('order_accounting_events').select('id,order_id,event_type').eq('tenant_id', tenantId).order('id')),
      ]);
      if (!isCurrent()) return;
      const failed = [orders, credits, cash, reservations, balances, invoices, deliveries, accountingEvents].find((result) => result.error);
      if (failed) throw failed.error;
      setReport(buildOperationalHealth({
        orders: orders.data, credits: credits.data, cashTransactions: cash.data,
        reservations: reservations.data, balances: balances.data, invoices: invoices.data,
        deliveries: deliveries.data, accountingEvents: accountingEvents.data,
      }));
    } catch (healthError) {
      if (isCurrent()) setError(healthError.message || String(healthError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [tenantId, begin]);

  useEffect(() => { refresh(); }, [refresh]);
  return { report, loading, error, refresh };
}

