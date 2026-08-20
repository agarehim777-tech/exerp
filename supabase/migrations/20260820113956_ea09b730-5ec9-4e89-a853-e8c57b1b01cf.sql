DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('app.tenant_purge', 'on', true);

  DELETE FROM public.order_accounting_events WHERE tenant_id = _tenant;
  DELETE FROM public.sales_cost_allocations WHERE tenant_id = _tenant;
  DELETE FROM public.reconciliation_lines rl
   USING public.financial_reconciliations fr
   WHERE rl.reconciliation_id = fr.id AND fr.tenant_id = _tenant;
  DELETE FROM public.journal_lines jl
   USING public.journal_entries je
   WHERE jl.entry_id = je.id AND je.tenant_id = _tenant;
  DELETE FROM public.journal_entries WHERE tenant_id = _tenant;

  DELETE FROM public.tenants WHERE id = _tenant;
  PERFORM set_config('app.tenant_purge', 'off', true);
END;
$fn$;

DO $$
DECLARE t uuid;
BEGIN
  PERFORM set_config('app.tenant_purge', 'on', true);
  FOR t IN SELECT id FROM public.tenants WHERE slug LIKE 'e2e-stock-%' LOOP
    DELETE FROM public.order_accounting_events WHERE tenant_id = t;
    DELETE FROM public.sales_cost_allocations WHERE tenant_id = t;
    DELETE FROM public.journal_lines jl USING public.journal_entries je
      WHERE jl.entry_id = je.id AND je.tenant_id = t;
    DELETE FROM public.journal_entries WHERE tenant_id = t;
    DELETE FROM public.tenants WHERE id = t;
  END LOOP;
END $$;