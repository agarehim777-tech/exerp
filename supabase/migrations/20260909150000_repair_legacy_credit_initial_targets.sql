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

