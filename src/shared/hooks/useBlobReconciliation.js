import { useCallback, useEffect, useState } from 'react';
import { readAllRows } from '../../services/readAllRows.js';
import { supabase } from '../../integrations/supabase/client';
import { buildReconciliationReport } from '../lib/blobReconciliation.js';
import { useTenantRequestScope } from './useTenantRequestScope';

/**
 * Blob (tenant_state_snapshots) ilə real cədvəlləri müqayisə edən barışdırma hook-u.
 */
export function useBlobReconciliation(tenantId) {
  const { begin } = useTenantRequestScope(tenantId);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);

  useEffect(() => { setReport(null); }, [tenantId]);
  const run = useCallback(async () => {
    if (!tenantId) { setReport(null); return; }
    const isCurrent = begin();
    setLoading(true);
    setError(null);
    try {
      const [snapRes, unitsRes, reservationRes, balanceRes, wfRes, notifRes, prodRes] = await Promise.all([
        supabase.from('tenant_state_snapshots').select('state, updated_at').eq('tenant_id', tenantId).maybeSingle(),
        readAllRows(() => supabase.from('inventory_units').select('id, product_id, warehouse_id, serial_no, imei, quantity, status').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('stock_reservations')
          .select('id, product_id, warehouse_id, order_id, quantity, status, order:orders(order_no)')
          .eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('stock_balances').select('product_id, warehouse_id, reserved').eq('tenant_id', tenantId).order('warehouse_id').order('product_id')),
        readAllRows(() => supabase.from('workflow_records').select('id, module, record_no, title, status').eq('tenant_id', tenantId).eq('module', 'production').order('id')),
        readAllRows(() => supabase.from('notification_deliveries').select('id, template_code, status, sent_at, scheduled_at, created_at, metadata').eq('tenant_id', tenantId).order('id')),
        readAllRows(() => supabase.from('products').select('id, name').eq('tenant_id', tenantId).order('id')),
      ]);

      if (!isCurrent()) return;
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
      if (isCurrent()) setError(e.message || String(e));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [tenantId, begin]);

  useEffect(() => { run(); }, [run]);

  return { report, loading, error, lastRunAt, refresh: run };
}
