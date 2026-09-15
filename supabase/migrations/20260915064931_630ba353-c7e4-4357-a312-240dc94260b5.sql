ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reference_type text;

CREATE INDEX IF NOT EXISTS cash_transactions_reference_idx
  ON public.cash_transactions(tenant_id, reference_type, reference_id);