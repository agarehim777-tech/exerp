-- Remove three confirmed orphan credit cash rows. The live sales payment is
-- deliberately excluded by both transaction number and category.
DO $$
DECLARE
  target_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO target_ids
  FROM public.cash_transactions
  WHERE category = 'credit_payment'
    AND transaction_no IN (
      'KRD-MT8K4947-VNQWSH',
      'KRD-MT8K4947-NP8SBT',
      'KRD-MT8K4947-P9N64Z'
    );

  IF cardinality(target_ids) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.sales_bonus_entries
  WHERE cash_transaction_id = ANY(target_ids);

  UPDATE public.reconciliation_lines
  SET ledger_transaction_id = NULL
  WHERE ledger_transaction_id = ANY(target_ids);

  UPDATE public.expenses
  SET cash_transaction_id = NULL
  WHERE cash_transaction_id = ANY(target_ids);

  DELETE FROM public.cash_transactions
  WHERE reversal_of = ANY(target_ids);

  DELETE FROM public.cash_transactions
  WHERE id = ANY(target_ids);
END;
$$;

-- Some existing projects have direction as text instead of the historical
-- cash_direction enum. Avoid an enum cast so the RPC works with both schemas.
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
    CASE original.direction::text WHEN 'in' THEN 'out' ELSE 'in' END,
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
