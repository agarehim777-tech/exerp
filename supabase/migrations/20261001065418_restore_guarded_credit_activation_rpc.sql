CREATE OR REPLACE FUNCTION public.start_credit_contract(_tenant_id uuid,_credit_id uuid,_start_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  contract_record public.credit_contracts%rowtype;
  target_order public.orders%rowtype;
  shortfall numeric(14,2);
  financed numeric(14,2);
  regular_amount numeric(14,2);
  last_amount numeric(14,2);
  installment_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'credits','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'credit_start_date_required'; END IF;
  SELECT * INTO contract_record FROM public.credit_contracts
    WHERE id=_credit_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF contract_record.order_id IS NOT NULL THEN
    SELECT * INTO target_order FROM public.orders
      WHERE id=contract_record.order_id AND tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit_order_not_found'; END IF;
    IF target_order.status::text IN ('cancelled','deleted','reversed') THEN RAISE EXCEPTION 'credit_order_cancelled'; END IF;
    IF coalesce(target_order.paid_amount,0)<contract_record.initial_payment THEN RAISE EXCEPTION 'credit_deposit_order_mismatch'; END IF;
  END IF;
  shortfall:=round(contract_record.required_initial-contract_record.initial_payment,2);
  IF shortfall>0 THEN RAISE EXCEPTION 'credit_initial_payment_incomplete: %',shortfall; END IF;
  IF shortfall<0 THEN RAISE EXCEPTION 'credit_initial_payment_overpaid'; END IF;
  financed:=round(contract_record.principal-contract_record.initial_payment,2);
  IF financed<=0 OR financed::text IN ('NaN','Infinity','-Infinity')
    OR contract_record.term_months NOT IN (2,3,4,5,6,12,18,24,36,48) THEN RAISE EXCEPTION 'invalid_financed_amount'; END IF;
  IF contract_record.status='active' AND contract_record.start_date=_start_date THEN
    IF (SELECT count(*) FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id)<>contract_record.term_months
      OR (SELECT coalesce(sum(principal_due),0) FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id)<>financed THEN
      RAISE EXCEPTION 'credit_activation_state_mismatch';
    END IF;
    RETURN _credit_id;
  END IF;
  IF contract_record.status<>'draft' THEN RAISE EXCEPTION 'credit_already_started'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,_start_date);
  regular_amount:=ceil(financed/contract_record.term_months);
  last_amount:=financed-regular_amount*(contract_record.term_months-1);
  IF last_amount<=0 THEN
    regular_amount:=floor(financed/contract_record.term_months);
    last_amount:=financed-regular_amount*(contract_record.term_months-1);
  END IF;
  DELETE FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id;
  FOR installment_no IN 1..contract_record.term_months LOOP
    INSERT INTO public.credit_installments(tenant_id,credit_id,installment_no,due_date,principal_due)
      VALUES(_tenant_id,_credit_id,installment_no,(_start_date+make_interval(months=>installment_no))::date,
        CASE WHEN installment_no=contract_record.term_months THEN last_amount ELSE regular_amount END);
  END LOOP;
  UPDATE public.credit_contracts SET start_date=_start_date,status='active',updated_at=now()
    WHERE id=_credit_id AND tenant_id=_tenant_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'credits','start',contract_record.contract_no,
      jsonb_build_object('credit_id',_credit_id,'start_date',_start_date,'financed',financed,
        'first_due_date',(_start_date+make_interval(months=>1))::date));
  RETURN _credit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_credit_contract(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_credit_contract(uuid,uuid,date) TO authenticated,service_role;
