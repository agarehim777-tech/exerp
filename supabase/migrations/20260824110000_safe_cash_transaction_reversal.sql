-- Cash ledger rows are immutable. User-facing deletion is implemented as a
-- compensating transaction so account balances and the audit trail stay valid.
ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.cash_transactions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_single_reversal_idx
  ON public.cash_transactions(reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_cash_transaction(
  _tenant_id uuid,
  _transaction_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  original public.cash_transactions%rowtype;
  reversal_id uuid;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'finance', 'edit') THEN
    RAISE EXCEPTION 'Bu əməliyyat üçün maliyyə redaktə icazəsi tələb olunur';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO original
  FROM public.cash_transactions
  WHERE tenant_id = _tenant_id AND id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Kassa əməliyyatı tapılmadı'; END IF;
  IF original.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Reversal əməliyyatı yenidən ləğv edilə bilməz'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_transactions WHERE reversal_of = original.id) THEN
    RAISE EXCEPTION 'Bu əməliyyat artıq ləğv edilib';
  END IF;

  INSERT INTO public.cash_transactions(
    tenant_id, account_id, direction, amount, currency, category,
    counterparty, customer_id, vendor_id, reference, description,
    occurred_at, created_by, reversal_of
  ) VALUES (
    original.tenant_id, original.account_id,
    CASE original.direction WHEN 'in' THEN 'out'::public.cash_direction ELSE 'in'::public.cash_direction END,
    original.amount, original.currency, 'transaction_reversal',
    original.counterparty, original.customer_id, original.vendor_id,
    original.reference,
    'Ləğv: ' || original.transaction_no || ' · ' || trim(_reason),
    current_date, auth.uid(), original.id
  ) RETURNING id INTO reversal_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'cash_transaction_reversed',
    original.transaction_no || ' əməliyyatı əks yazılışla ləğv edildi',
    jsonb_build_object('transaction_id', original.id, 'reversal_id', reversal_id, 'reason', trim(_reason))
  );

  RETURN reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_cash_transaction(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_cash_transaction(uuid, uuid, text) TO authenticated, service_role;

