import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { buildOperationalHealth } from '../lib/operationalHealth.js';

export function useOperationalHealth(tenantId) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId) return setReport(null);
    setLoading(true);
    setError('');
    try {
      const [orders, credits, cash, reservations, balances, invoices, deliveries, accountingEvents] = await Promise.all([
        supabase.from('orders').select('id,order_no,status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('credit_contracts').select('id,order_id,contract_no,status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('cash_transactions').select('id,category,reference_type,reference_id,reference,description,reversed_at,reversal_of').eq('tenant_id', tenantId).limit(5000),
        supabase.from('stock_reservations').select('id,order_id,warehouse_id,product_id,quantity,status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('stock_balances').select('warehouse_id,product_id,reserved').eq('tenant_id', tenantId).limit(5000),
        supabase.from('sales_invoices').select('id,invoice_no,order_id,status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('deliveries').select('id,delivery_no,order_id,status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('order_accounting_events').select('id,order_id,event_type').eq('tenant_id', tenantId).limit(5000),
      ]);
      const failed = [orders, credits, cash, reservations, balances, invoices, deliveries, accountingEvents].find((result) => result.error);
      if (failed) throw failed.error;
      setReport(buildOperationalHealth({
        orders: orders.data, credits: credits.data, cashTransactions: cash.data,
        reservations: reservations.data, balances: balances.data, invoices: invoices.data,
        deliveries: deliveries.data, accountingEvents: accountingEvents.data,
      }));
    } catch (healthError) {
      setError(healthError.message || String(healthError));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { report, loading, error, refresh };
}

