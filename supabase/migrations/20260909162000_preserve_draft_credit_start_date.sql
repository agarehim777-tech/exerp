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

