DROP INDEX IF EXISTS public.expenses_tenant_expense_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_tenant_expense_no_uidx
  ON public.expenses(tenant_id, expense_no);