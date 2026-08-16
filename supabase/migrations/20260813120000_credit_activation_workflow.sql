ALTER TABLE public.credit_contracts
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft';

CREATE OR REPLACE FUNCTION public.start_credit_contract(
  _tenant_id UUID,
  _credit_id UUID,
  _start_date DATE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  financed NUMERIC(14,2);
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

  financed := round(contract_record.principal - contract_record.initial_payment, 2);
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
      'first_due_date', (_start_date + make_interval(months => 1))::date)
  );
  RETURN _credit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_credit_contract(UUID,UUID,DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_credit_contract(UUID,UUID,DATE) TO authenticated, service_role;

-- New sales create a separate draft contract. The schedule is generated only
-- after the responsible user confirms the exact credit start date.
CREATE OR REPLACE FUNCTION public.create_credit_contract(
  _tenant_id UUID,
  _contract_no TEXT,
  _customer_id UUID,
  _order_id UUID,
  _principal NUMERIC,
  _initial_payment NUMERIC,
  _term_months INTEGER,
  _start_date DATE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE credit_id UUID;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _term_months NOT IN (2,3,4,5,6,12,18,24,36,48) THEN RAISE EXCEPTION 'invalid_credit_term'; END IF;
  IF round(_principal - COALESCE(_initial_payment, 0), 2) <= 0 THEN RAISE EXCEPTION 'invalid_financed_amount'; END IF;

  INSERT INTO public.credit_contracts(
    tenant_id, contract_no, customer_id, order_id, principal,
    initial_payment, term_months, start_date, status
  ) VALUES (
    _tenant_id, trim(_contract_no), _customer_id, _order_id, _principal,
    COALESCE(_initial_payment, 0), _term_months, NULL, 'draft'
  ) RETURNING id INTO credit_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'create_draft',
    trim(_contract_no) || ' başlanmamış kredit müqaviləsi yaradıldı',
    jsonb_build_object('credit_id', credit_id, 'order_id', _order_id)
  );
  RETURN credit_id;
END;
$$;
