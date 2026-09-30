ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0);

-- Preserve existing currency; infer missing values only from the linked account.
UPDATE public.expenses e SET account_id=e.cash_account_id
 WHERE e.account_id IS NULL AND e.cash_account_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.cash_accounts a WHERE a.id=e.cash_account_id AND a.tenant_id=e.tenant_id);
UPDATE public.expenses e SET currency=a.currency FROM public.cash_accounts a
 WHERE e.account_id=a.id AND e.tenant_id=a.tenant_id AND e.currency IS NULL;
UPDATE public.expenses SET currency='AZN' WHERE currency IS NULL;
ALTER TABLE public.expenses ALTER COLUMN currency SET DEFAULT 'AZN', ALTER COLUMN currency SET NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_account_id_idx ON public.expenses(account_id);
