ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS transaction_no text,
  ADD COLUMN IF NOT EXISTS reference_id uuid;

CREATE INDEX IF NOT EXISTS cash_transactions_reference_id_idx ON public.cash_transactions(tenant_id, reference_id);
CREATE INDEX IF NOT EXISTS cash_transactions_transaction_no_idx ON public.cash_transactions(tenant_id, transaction_no);