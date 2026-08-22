CREATE OR REPLACE FUNCTION public.post_credit_payment(
  _tenant_id uuid,
  _credit_id uuid,
  _receipt_no text,
  _amount numeric,
  _penalty_amount numeric DEFAULT 0,
  _cash_account_id uuid DEFAULT NULL,
  _payment_method text DEFAULT 'cash',
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  payment_id uuid;
  penalty_left numeric(14,2) := round(GREATEST(0, COALESCE(_penalty_amount, 0)), 2);
  principal_left numeric(14,2);
  unallocated numeric(14,2) := 0;
  applied numeric(14,2);
  inst RECORD;
  account_id uuid := _cash_account_id;
  outstanding numeric(14,2);
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF COALESCE(_amount, 0) <= 0 THEN RAISE EXCEPTION 'credit_payment_amount_required'; END IF;

  SELECT * INTO contract_record FROM public.credit_contracts
   WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF contract_record.status = 'draft' THEN RAISE EXCEPTION 'credit_not_started'; END IF;
  IF contract_record.status IN ('cancelled') THEN RAISE EXCEPTION 'credit_not_active'; END IF;

  principal_left := round(_amount, 2) - penalty_left;
  IF principal_left < 0 THEN RAISE EXCEPTION 'credit_penalty_exceeds_amount'; END IF;

  IF account_id IS NULL THEN
    SELECT id INTO account_id FROM public.cash_accounts
     WHERE tenant_id = _tenant_id AND is_active
     ORDER BY (lower(btrim(name)) = lower('Əsas kassa')) DESC, created_at
     LIMIT 1;
  END IF;
  IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;

  -- cəriməni ən köhnə taksitlərdən bağla
  FOR inst IN
    SELECT * FROM public.credit_installments
     WHERE credit_id = _credit_id AND tenant_id = _tenant_id
       AND status <> 'waived' AND penalty_paid < penalty_due
     ORDER BY installment_no
     FOR UPDATE
  LOOP
    EXIT WHEN penalty_left <= 0;
    applied := LEAST(penalty_left, inst.penalty_due - inst.penalty_paid);
    UPDATE public.credit_installments SET penalty_paid = penalty_paid + applied WHERE id = inst.id;
    penalty_left := penalty_left - applied;
  END LOOP;

  -- əsas borcu ən köhnə taksitlərdən bağla
  FOR inst IN
    SELECT * FROM public.credit_installments
     WHERE credit_id = _credit_id AND tenant_id = _tenant_id
       AND status <> 'waived' AND principal_paid < principal_due
     ORDER BY installment_no
     FOR UPDATE
  LOOP
    EXIT WHEN principal_left <= 0;
    applied := LEAST(principal_left, inst.principal_due - inst.principal_paid);
    UPDATE public.credit_installments
       SET principal_paid = principal_paid + applied
     WHERE id = inst.id;
    principal_left := principal_left - applied;
  END LOOP;

  unallocated := round(GREATEST(0, principal_left) + GREATEST(0, penalty_left), 2);

  UPDATE public.credit_installments i
     SET status = CASE
           WHEN i.principal_paid >= i.principal_due AND i.penalty_paid >= i.penalty_due THEN 'paid'
           WHEN i.principal_paid > 0 OR i.penalty_paid > 0 THEN
             CASE WHEN i.due_date < CURRENT_DATE THEN 'overdue' ELSE 'partial' END
           WHEN i.due_date < CURRENT_DATE THEN 'overdue'
           ELSE 'pending' END,
         paid_at = CASE WHEN i.principal_paid >= i.principal_due AND i.penalty_paid >= i.penalty_due
                        THEN COALESCE(i.paid_at, now()) ELSE NULL END
   WHERE i.credit_id = _credit_id AND i.tenant_id = _tenant_id AND i.status <> 'waived';

  INSERT INTO public.credit_payments(
    tenant_id, credit_id, receipt_no, amount, principal_amount, penalty_amount,
    unallocated_amount, payment_method, note
  ) VALUES (
    _tenant_id, _credit_id, _receipt_no, round(_amount, 2),
    round(_amount, 2) - round(GREATEST(0, COALESCE(_penalty_amount, 0)), 2) - GREATEST(0, principal_left),
    round(GREATEST(0, COALESCE(_penalty_amount, 0)), 2) - GREATEST(0, penalty_left),
    unallocated, COALESCE(_payment_method, 'cash'), _note
  ) RETURNING id INTO payment_id;

  INSERT INTO public.cash_transactions(
    tenant_id, account_id, direction, amount, category, description, reference_id, occurred_at
  ) VALUES (
    _tenant_id, account_id, 'in', round(_amount, 2), 'credit_payment',
    COALESCE(_note, contract_record.contract_no || ' kredit ödənişi'), payment_id, CURRENT_DATE
  );

  SELECT COALESCE(sum((principal_due - principal_paid) + (penalty_due - penalty_paid)), 0)
    INTO outstanding
    FROM public.credit_installments
   WHERE credit_id = _credit_id AND tenant_id = _tenant_id AND status <> 'waived';

  UPDATE public.credit_contracts
     SET status = CASE
           WHEN outstanding <= 0 THEN 'closed'
           WHEN EXISTS (
             SELECT 1 FROM public.credit_installments ci
              WHERE ci.credit_id = _credit_id AND ci.status = 'overdue'
           ) THEN 'overdue'
           ELSE 'active' END,
         collection_stage = CASE WHEN outstanding <= 0 THEN 'closed' ELSE collection_stage END,
         closed_at = CASE WHEN outstanding <= 0 THEN COALESCE(closed_at, now()) ELSE NULL END,
         updated_at = now()
   WHERE id = _credit_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'payment',
    contract_record.contract_no || ' üzrə ödəniş qəbul edildi',
    jsonb_build_object('credit_id', _credit_id, 'payment_id', payment_id,
      'amount', round(_amount, 2), 'penalty', round(GREATEST(0, COALESCE(_penalty_amount, 0)), 2),
      'outstanding', outstanding)
  );

  RETURN payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_credit_payment(uuid, uuid, text, numeric, numeric, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_credit_payment(uuid, uuid, text, numeric, numeric, uuid, text, text) TO authenticated;