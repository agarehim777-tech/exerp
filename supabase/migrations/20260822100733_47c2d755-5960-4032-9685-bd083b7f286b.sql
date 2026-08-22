CREATE OR REPLACE FUNCTION public.post_credit_initial_payment(
  _tenant_id uuid, _credit_id uuid, _amount numeric,
  _cash_account_id uuid DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  remaining numeric(14,2);
  applied numeric(14,2);
  account_id uuid := _cash_account_id;
  order_currency text := 'AZN';
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'credit_payment_amount_required';
  END IF;

  SELECT * INTO contract_record FROM public.credit_contracts
   WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF contract_record.status <> 'draft' THEN RAISE EXCEPTION 'credit_already_started'; END IF;

  remaining := round(contract_record.required_initial - contract_record.initial_payment, 2);
  IF remaining <= 0 THEN RAISE EXCEPTION 'initial_payment_already_complete'; END IF;

  applied := round(_amount, 2);
  IF applied > remaining THEN
    RAISE EXCEPTION 'initial_payment_exceeds_target: qalıq % AZN, daxil edilən % AZN', remaining, applied;
  END IF;

  IF contract_record.order_id IS NOT NULL THEN
    UPDATE public.credit_contracts
       SET initial_payment = initial_payment + applied, updated_at = now()
     WHERE id = _credit_id;
  ELSE
    IF account_id IS NULL THEN
      SELECT id, currency INTO account_id, order_currency FROM public.cash_accounts
       WHERE tenant_id = _tenant_id AND is_active
       ORDER BY (lower(btrim(name)) = lower('Əsas kassa')) DESC, created_at
       LIMIT 1;
    ELSE
      SELECT currency INTO order_currency FROM public.cash_accounts
       WHERE id = account_id AND tenant_id = _tenant_id;
    END IF;
    IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;

    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      customer_id, reference, description, occurred_at, created_by, reference_id
    ) VALUES (
      _tenant_id, account_id, 'in', applied, COALESCE(order_currency, 'AZN'), 'credit_initial',
      contract_record.customer_id, contract_record.contract_no,
      COALESCE(_note, contract_record.contract_no || ' ilkin ödəniş'),
      CURRENT_DATE, auth.uid(), _credit_id
    );

    UPDATE public.credit_contracts
       SET initial_payment = initial_payment + applied, updated_at = now()
     WHERE id = _credit_id;
  END IF;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'initial_payment',
    contract_record.contract_no || ' üzrə ilkin ödəniş qəbul edildi',
    jsonb_build_object('credit_id', _credit_id, 'amount', applied,
      'note', COALESCE(_note, 'İlkin ödəniş (beh)'),
      'paid_initial', round(contract_record.initial_payment + applied, 2),
      'required_initial', contract_record.required_initial)
  );

  RETURN round(remaining - applied, 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.post_credit_initial_payment(uuid, uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_credit_initial_payment(uuid, uuid, numeric, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_credit_contract(_tenant_id uuid, _credit_id uuid, _start_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  financed NUMERIC(14,2);
  shortfall NUMERIC(14,2);
  regular_amount NUMERIC(14,2);
  last_amount NUMERIC(14,2);
  installment_no INTEGER;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'credit_start_date_required'; END IF;

  SELECT * INTO contract_record
  FROM public.credit_contracts
  WHERE id = _credit_id AND tenant_id = _tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF contract_record.status <> 'draft' THEN RAISE EXCEPTION 'credit_already_started'; END IF;

  shortfall := round(COALESCE(contract_record.required_initial, 0) - COALESCE(contract_record.initial_payment, 0), 2);
  IF shortfall > 0 THEN
    RAISE EXCEPTION 'credit_initial_payment_incomplete: yığılıb % / hədəf %, çatışmır %',
      round(COALESCE(contract_record.initial_payment, 0), 2),
      round(COALESCE(contract_record.required_initial, 0), 2),
      shortfall;
  END IF;
  IF shortfall < 0 THEN
    RAISE EXCEPTION 'credit_initial_payment_overpaid: yığılıb % / hədəf %',
      round(COALESCE(contract_record.initial_payment, 0), 2),
      round(COALESCE(contract_record.required_initial, 0), 2);
  END IF;

  financed := round(contract_record.principal - contract_record.initial_payment, 2);
  IF financed <= 0 THEN RAISE EXCEPTION 'invalid_financed_amount'; END IF;
  regular_amount := ceil(financed / contract_record.term_months);
  last_amount := financed - regular_amount * (contract_record.term_months - 1);
  IF last_amount <= 0 THEN
    regular_amount := floor(financed / contract_record.term_months);
    last_amount := financed - regular_amount * (contract_record.term_months - 1);
  END IF;

  DELETE FROM public.credit_installments WHERE credit_id = _credit_id;
  FOR installment_no IN 1..contract_record.term_months LOOP
    INSERT INTO public.credit_installments(
      tenant_id, credit_id, installment_no, due_date, principal_due
    ) VALUES (
      _tenant_id, _credit_id, installment_no,
      (_start_date + make_interval(months => installment_no))::date,
      CASE WHEN installment_no = contract_record.term_months THEN last_amount ELSE regular_amount END
    );
  END LOOP;

  UPDATE public.credit_contracts
  SET start_date = _start_date, status = 'active', updated_at = now()
  WHERE id = _credit_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'start',
    contract_record.contract_no || ' krediti başladıldı',
    jsonb_build_object('credit_id', _credit_id, 'start_date', _start_date,
      'financed', financed,
      'first_due_date', (_start_date + make_interval(months => 1))::date)
  );
  RETURN _credit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_credit_contract(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_credit_contract(uuid, uuid, date) TO authenticated;