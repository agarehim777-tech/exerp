DO $$ DECLARE definition text; name text; BEGIN
 SELECT pg_get_functiondef('public.run_kpi_period_atomic(uuid,text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'FROM public.tenant_collection_records WHERE tenant_id=_tenant_id AND collection=''employees''','FROM public.employees WHERE tenant_id=_tenant_id');
 definition:=replace(definition,'data->>''id''=employee->>''employeeId''','id::text=employee->>''employeeId''');
 EXECUTE definition;
 FOREACH name IN ARRAY ARRAY['reverse_vendor_invoice_payment','reverse_procurement_receipt'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  definition:=replace(definition,'AND current_user NOT IN (''postgres'', ''service_role'', ''supabase_admin'')','AND coalesce(auth.role(), '''') <> ''service_role''');
  EXECUTE definition;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS receivable_settlements_credit_idx ON public.receivable_settlements(credit_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_order_idx ON public.receivable_settlements(order_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_invoice_idx ON public.receivable_settlements(invoice_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_account_idx ON public.receivable_settlements(account_id);
CREATE INDEX IF NOT EXISTS kpi_periods_account_idx ON public.kpi_periods(account_id);
REVOKE INSERT,UPDATE,DELETE ON public.tenant_collection_records FROM authenticated;
COMMENT ON TABLE public.finance_credit_records IS 'Standalone legacy credit records only. Order-linked credit contracts and payments remain authoritative in credit_contracts and credit_payments.';
COMMENT ON TABLE public.finance_account_records IS 'Legacy account registry only. Posted cash balance is authoritative in cash_accounts and cash_transactions.';