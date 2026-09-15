CREATE OR REPLACE FUNCTION public.register_order_payment(
  _order_id uuid,
  _amount numeric,
  _account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.orders%rowtype;
  account_row public.cash_accounts%rowtype;
  transaction_id uuid;
  next_paid numeric;
  transaction_number text;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL OR NOT public.is_tenant_member(target.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF target.status::text = 'cancelled' THEN
    RAISE EXCEPTION 'Ləğv edilmiş satışa ödəniş qəbul edilə bilməz';
  END IF;
  IF _amount IS NULL OR _amount <= 0
     OR coalesce(target.paid_amount, 0) + _amount > target.total + 0.009 THEN
    RAISE EXCEPTION 'Ödəniş məbləği düzgün deyil';
  END IF;

  SELECT * INTO account_row
    FROM public.cash_accounts
   WHERE id = _account_id
     AND tenant_id = target.tenant_id
     AND is_active = true
   FOR UPDATE;
  IF account_row.id IS NULL THEN RAISE EXCEPTION 'Kassa tapılmadı'; END IF;

  transaction_number := 'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, currency,
    category, customer_id, reference_type, reference_id, reference,
    description, occurred_at, created_by
  ) VALUES (
    target.tenant_id, account_row.id, transaction_number, 'in', round(_amount, 2),
    target.currency, 'sales_payment', target.customer_id, 'sales_order', target.id,
    target.order_no, target.order_no || ' sifarişi üzrə ödəniş', current_date, auth.uid()
  ) RETURNING id INTO transaction_id;

  next_paid := round(coalesce(target.paid_amount, 0) + _amount, 2);
  UPDATE public.orders
     SET paid_amount = next_paid,
         payment_status = CASE
           WHEN next_paid >= total THEN 'paid'::public.payment_status
           WHEN next_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'unpaid'::public.payment_status
         END,
         updated_at = now()
   WHERE id = target.id;
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid, numeric, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_credit_initial_payment(
  _tenant_id uuid, _credit_id uuid, _amount numeric,
  _cash_account_id uuid DEFAULT NULL, _note text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, private AS $$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  target_order public.orders%ROWTYPE;
  remaining numeric(14,2);
  applied numeric(14,2);
  account_id uuid := _cash_account_id;
  account_currency text := 'AZN';
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN RAISE EXCEPTION 'credit_payment_amount_required'; END IF;

  SELECT * INTO contract_record FROM public.credit_contracts
   WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;

  IF COALESCE(contract_record.required_initial, 0) <= 0 THEN
    IF EXISTS (SELECT 1 FROM public.credit_payments WHERE credit_id = _credit_id) THEN
      RAISE EXCEPTION 'legacy_credit_has_payments';
    END IF;
    UPDATE public.credit_contracts
       SET required_initial = GREATEST(initial_payment, round(principal * 0.10, 2)),
           status = 'draft', start_date = NULL, updated_at = now()
     WHERE id = _credit_id;
    DELETE FROM public.credit_installments WHERE credit_id = _credit_id;
    SELECT * INTO contract_record FROM public.credit_contracts WHERE id = _credit_id;
  END IF;

  IF contract_record.status <> 'draft' THEN RAISE EXCEPTION 'credit_already_started'; END IF;
  remaining := round(contract_record.required_initial - contract_record.initial_payment, 2);
  applied := round(_amount, 2);
  IF remaining <= 0 THEN RAISE EXCEPTION 'initial_payment_already_complete'; END IF;
  IF applied > remaining THEN RAISE EXCEPTION 'initial_payment_exceeds_target'; END IF;

  IF contract_record.order_id IS NOT NULL THEN
    SELECT * INTO target_order FROM public.orders
     WHERE id = contract_record.order_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit_order_not_found'; END IF;
    IF account_id IS NULL THEN
      SELECT id INTO account_id FROM public.cash_accounts
       WHERE tenant_id = _tenant_id AND is_active AND currency = target_order.currency
       ORDER BY (lower(btrim(name)) = lower('Əsas kassa')) DESC, created_at LIMIT 1;
    END IF;
    IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
    PERFORM public.register_order_payment(target_order.id, applied, account_id);
  ELSE
    IF account_id IS NULL THEN
      SELECT id, currency INTO account_id, account_currency FROM public.cash_accounts
       WHERE tenant_id = _tenant_id AND is_active
       ORDER BY (lower(btrim(name)) = lower('Əsas kassa')) DESC, created_at LIMIT 1;
    ELSE
      SELECT currency INTO account_currency FROM public.cash_accounts
       WHERE id = account_id AND tenant_id = _tenant_id AND is_active;
    END IF;
    IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      customer_id, reference, reference_id, description, occurred_at, created_by
    ) VALUES (
      _tenant_id, account_id, 'in', applied, COALESCE(account_currency, 'AZN'), 'credit_initial',
      contract_record.customer_id, contract_record.contract_no, _credit_id,
      COALESCE(_note, contract_record.contract_no || ' ilkin ödəniş'), CURRENT_DATE, auth.uid()
    );
  END IF;

  UPDATE public.credit_contracts SET initial_payment = initial_payment + applied, updated_at = now()
   WHERE id = _credit_id;
  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'initial_payment',
    contract_record.contract_no || ' üzrə ilkin ödəniş qəbul edildi',
    jsonb_build_object('credit_id', _credit_id, 'amount', applied,
      'paid_initial', round(contract_record.initial_payment + applied, 2),
      'required_initial', contract_record.required_initial));
  RETURN round(remaining - applied, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.post_credit_initial_payment(uuid, uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_credit_initial_payment(uuid, uuid, numeric, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_credit_contract(
  _tenant_id uuid, _contract_no text, _customer_id uuid, _order_id uuid,
  _principal numeric, _initial_payment numeric, _term_months integer, _start_date date,
  _required_initial numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  credit_id uuid;
  target_initial numeric(14,2);
  paid_initial numeric(14,2);
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _term_months NOT IN (2,3,4,5,6,12,18,24,36,48) THEN
    RAISE EXCEPTION 'invalid_credit_term';
  END IF;

  paid_initial := round(GREATEST(0, COALESCE(_initial_payment, 0)), 2);
  target_initial := round(GREATEST(paid_initial, COALESCE(_required_initial, paid_initial)), 2);
  IF round(_principal - target_initial, 2) <= 0 THEN
    RAISE EXCEPTION 'invalid_financed_amount';
  END IF;

  INSERT INTO public.credit_contracts(
    tenant_id, contract_no, customer_id, order_id, principal,
    initial_payment, required_initial, term_months, start_date, status
  ) VALUES (
    _tenant_id, trim(_contract_no), _customer_id, _order_id, _principal,
    paid_initial, target_initial, _term_months,
    COALESCE(_start_date, CURRENT_DATE), 'draft'
  ) RETURNING id INTO credit_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'create_draft',
    trim(_contract_no) || ' başlanmamış kredit müqaviləsi yaradıldı',
    jsonb_build_object('credit_id', credit_id, 'order_id', _order_id,
      'required_initial', target_initial, 'paid_initial', paid_initial)
  );
  RETURN credit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_credit_contract(uuid, text, uuid, uuid, numeric, numeric, integer, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_contract(uuid, text, uuid, uuid, numeric, numeric, integer, date, numeric) TO authenticated;