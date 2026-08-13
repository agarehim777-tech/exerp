-- 1. Hot-path indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON public.journal_entries(tenant_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON public.orders(tenant_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created ON public.stock_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_date ON public.sales_invoices(tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_tenant_created ON public.app_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_occurred ON public.audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);

-- 2. Log retention
CREATE OR REPLACE FUNCTION public.prune_operational_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app int := 0;
  v_audit int := 0;
  v_events int := 0;
BEGIN
  DELETE FROM public.app_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_app = ROW_COUNT;
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  DELETE FROM public.audit_events WHERE occurred_at < now() - interval '365 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  RETURN jsonb_build_object('app_logs', v_app, 'audit_logs', v_audit, 'audit_events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.prune_operational_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_operational_logs() TO service_role;

DO $$
BEGIN
  PERFORM cron.schedule('prune-operational-logs', '17 3 * * *', 'SELECT public.prune_operational_logs()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, skipping schedule';
END;
$$;