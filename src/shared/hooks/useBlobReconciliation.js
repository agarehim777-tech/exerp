import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { buildReconciliationReport } from '../lib/blobReconciliation.js';

/**
 * Blob (tenant_state_snapshots) ilə real cədvəlləri müqayisə edən barışdırma hook-u.
 */
export function useBlobReconciliation(tenantId) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);

  const run = useCallback(async () => {
    if (!tenantId) { setReport(null); return; }
    setLoading(true);
    setError(null);
    try {
      const [snapRes, unitsRes, reservationRes, balanceRes, wfRes, notifRes, prodRes] = await Promise.all([
        supabase.from('tenant_state_snapshots').select('state, updated_at').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('inventory_units').select('id, product_id, warehouse_id, serial_no, imei, quantity, status').eq('tenant_id', tenantId).limit(5000),
        supabase.from('stock_reservations')
          .select('id, product_id, warehouse_id, order_id, quantity, status, order:orders(order_no)')
          .eq('tenant_id', tenantId).limit(5000),
        supabase.from('stock_balances').select('product_id, warehouse_id, reserved').eq('tenant_id', tenantId).limit(5000),
        supabase.from('workflow_records').select('id, module, record_no, title, status').eq('tenant_id', tenantId).eq('module', 'production').limit(2000),
        supabase.from('notification_deliveries').select('id, template_code, status, sent_at, scheduled_at, created_at, metadata').eq('tenant_id', tenantId).limit(2000),
        supabase.from('products').select('id, name').eq('tenant_id', tenantId).limit(5000),
      ]);

      const firstError = [snapRes, unitsRes, reservationRes, balanceRes, wfRes, notifRes, prodRes].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const state = snapRes.data?.state || {};
      const productNameById = Object.fromEntries((prodRes.data || []).map((p) => [p.id, p.name]));

      setReport(
        buildReconciliationReport({
          warehouseStock: state.warehouseStock || {},
          productionPlans: state.productionPlans || [],
          notificationRules: state.notificationRules || [],
          sendLog: state.notificationSendLog || state.sendLog || [],
          units: unitsRes.data || [],
          stockReservations: reservationRes.data || [],
          stockBalances: balanceRes.data || [],
          workflowRecords: wfRes.data || [],
          deliveries: notifRes.data || [],
          productNameById,
        }),
      );
      setLastRunAt(new Date().toISOString());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { run(); }, [run]);

  return { report, loading, error, lastRunAt, refresh: run };
}
