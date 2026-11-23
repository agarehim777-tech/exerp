-- Live updates: the app subscribes to postgres_changes on these tables (useRealtimeResync and the
-- per-hook channels), but only eight tables were ever added to the supabase_realtime publication. For the
-- rest no change event was ever sent, so other users' edits (and some of the user's own, e.g. shipments)
-- showed up only after a manual refresh, reconnect or tab switch. Realtime still applies each table's RLS
-- select policy per subscriber, so members only receive their own tenant's rows.
-- Idempotent: tables that are already published or do not exist are skipped.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication missing, skipped';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'accounting_periods', 'business_contracts', 'cash_accounts', 'cash_transactions',
    'credit_contracts', 'credit_installments', 'credit_payments', 'crm_pipelines',
    'currencies', 'employees', 'exchange_rates', 'expenses',
    'finance_account_records', 'finance_credit_records', 'finance_entries', 'goods_receipts',
    'hr_departments', 'hr_leave_requests', 'hr_vacancies', 'inventory_units',
    'invoice_payments', 'journal_entries', 'journal_lines', 'order_bonus_assignments',
    'po_payments', 'production_batches', 'purchase_order_lines', 'purchase_orders',
    'sales_bonus_entries', 'sales_invoice_lines', 'sales_invoices', 'sales_shipments',
    'stock_balances', 'stock_movements', 'vendor_invoices', 'vendors', 'warehouses'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
