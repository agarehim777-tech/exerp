ALTER TABLE public.cash_accounts
  ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_accounts_gl_account_idx
  ON public.cash_accounts(gl_account_id) WHERE gl_account_id IS NOT NULL;
