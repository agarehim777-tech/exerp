ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_tenant_expense_no_key
  ON public.expenses(tenant_id, expense_no)
  WHERE expense_no IS NOT NULL;