CREATE OR REPLACE FUNCTION public.post_credit_payment(
  _tenant_id uuid, _credit_id uuid, _receipt_no text, _amount numeric,
  _penalty_amount numeric DEFAULT 0, _cash_account_id uuid DEFAULT NULL,
  _payment_method text DEFAULT 'cash', _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  contract public.credit_contracts%rowtype;
  sale public.orders%rowtype;
  account public.cash_accounts%rowtype;
  installment public.credit_installments%rowtype;
  receipt_id uuid;
  linked_order uuid;
  payload_hash text;
  v_request_key text;
  cash_amount numeric := round(_amount,2);
  penalty numeric := round(coalesce(_penalty_amount,0),2);
  principal numeric;
  principal_left numeric;
  penalty_left numeric;
  allocated_principal numeric;
  allocated_penalty numeric;
  outstanding numeric;
  v_currency text := 'AZN';
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'credits','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF cash_amount IS NULL OR cash_amount<=0 OR _amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid_credit_payment_amount';
  END IF;
  IF penalty<0 OR penalty>cash_amount OR _penalty_amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid_credit_penalty_amount';
  END IF;
  IF nullif(trim(_receipt_no),'') IS NULL OR length(_receipt_no)>120 THEN RAISE EXCEPTION 'invalid_receipt_no'; END IF;
  v_request_key := 'credit-payment:'||trim(_receipt_no);
  payload_hash := md5(jsonb_build_object('credit_id',_credit_id,'amount',cash_amount,
    'penalty',penalty,'account_id',_cash_account_id,'method',coalesce(_payment_method,'cash'),'note',_note)::text);
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,v_request_key,'post_credit_payment',payload_hash)
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests r
    WHERE r.tenant_id=_tenant_id AND r.request_key=v_request_key FOR UPDATE;
  IF request.operation<>'post_credit_payment' OR request.request_hash<>payload_hash THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN (request.result->>'payment_id')::uuid; END IF;

  -- Use the same order-before-credit lock order as sale reversal.
  SELECT c.order_id INTO linked_order FROM public.credit_contracts c WHERE c.id=_credit_id AND c.tenant_id=_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF linked_order IS NOT NULL THEN
    SELECT * INTO sale FROM public.orders WHERE id=linked_order AND tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND OR sale.status='cancelled' THEN RAISE EXCEPTION 'order_not_active'; END IF;
    v_currency := sale.currency;
  END IF;
  SELECT * INTO contract FROM public.credit_contracts WHERE id=_credit_id AND tenant_id=_tenant_id FOR UPDATE;
  IF contract.order_id IS DISTINCT FROM linked_order THEN RAISE EXCEPTION 'credit_order_changed'; END IF;
  IF contract.status='draft' THEN RAISE EXCEPTION 'credit_not_started'; END IF;
  IF contract.status NOT IN ('active','overdue') THEN RAISE EXCEPTION 'credit_not_active'; END IF;
  SELECT * INTO account FROM public.cash_accounts
    WHERE tenant_id=_tenant_id AND is_active AND currency=v_currency
      AND (_cash_account_id IS NULL OR id=_cash_account_id)
    ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
  principal := cash_amount-penalty;
  SELECT coalesce(sum(principal_due-principal_paid),0) INTO outstanding FROM public.credit_installments
    WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status<>'waived';
  IF principal>outstanding THEN RAISE EXCEPTION 'credit_payment_exceeds_balance'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status<>'waived') THEN
    RAISE EXCEPTION 'credit_schedule_missing';
  END IF;
  INSERT INTO public.credit_payments(tenant_id,credit_id,receipt_no,amount,principal_amount,penalty_amount,
    unallocated_amount,payment_method,note)
    VALUES(_tenant_id,_credit_id,trim(_receipt_no),cash_amount,principal,penalty,0,coalesce(_payment_method,'cash'),_note)
    RETURNING id INTO receipt_id;
  principal_left := principal;
  penalty_left := penalty;
  FOR installment IN SELECT * FROM public.credit_installments
    WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status<>'waived' ORDER BY installment_no FOR UPDATE
  LOOP
    allocated_principal := least(principal_left,installment.principal_due-installment.principal_paid);
    allocated_penalty := least(penalty_left,installment.penalty_due-installment.penalty_paid);
    IF allocated_principal>0 OR allocated_penalty>0 THEN
      UPDATE public.credit_installments SET principal_paid=principal_paid+allocated_principal,
        penalty_paid=penalty_paid+allocated_penalty WHERE id=installment.id AND tenant_id=_tenant_id;
      INSERT INTO public.credit_payment_allocations(tenant_id,payment_id,installment_id,principal_amount,penalty_amount)
        VALUES(_tenant_id,receipt_id,installment.id,allocated_principal,allocated_penalty);
      principal_left := principal_left-allocated_principal;
      penalty_left := penalty_left-allocated_penalty;
    END IF;
  END LOOP;
  IF principal_left<>0 THEN RAISE EXCEPTION 'credit_principal_allocation_failed'; END IF;
  -- A manually collected late fee is cash income, never extra principal or an unallocated deposit.
  UPDATE public.credit_installments SET
    status=CASE WHEN principal_paid>=principal_due AND penalty_paid>=penalty_due THEN 'paid'
      WHEN due_date<current_date THEN 'overdue' WHEN principal_paid>0 OR penalty_paid>0 THEN 'partial' ELSE 'pending' END,
    paid_at=CASE WHEN principal_paid>=principal_due AND penalty_paid>=penalty_due THEN coalesce(paid_at,now()) ELSE NULL END
    WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status<>'waived';
  INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,category,description,
    reference_type,reference_id,reference,currency,customer_id)
    VALUES(_tenant_id,account.id,'in',cash_amount,'credit_payment',coalesce(_note,contract.contract_no||' credit payment'),
      'credit_payment',receipt_id,contract.contract_no,v_currency,contract.customer_id);
  SELECT coalesce(sum(principal_due-principal_paid+penalty_due-penalty_paid),0) INTO outstanding
    FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status<>'waived';
  UPDATE public.credit_contracts SET status=CASE WHEN outstanding=0 THEN 'closed'
    WHEN EXISTS(SELECT 1 FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=_credit_id AND status='overdue')
      THEN 'overdue' ELSE 'active' END,
    collection_stage=CASE WHEN outstanding=0 THEN 'closed' ELSE collection_stage END,
    closed_at=CASE WHEN outstanding=0 THEN now() ELSE NULL END,updated_at=now()
    WHERE id=_credit_id AND tenant_id=_tenant_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'credits','payment',contract.contract_no||' payment received',
      jsonb_build_object('credit_id',_credit_id,'payment_id',receipt_id,'amount',cash_amount,
        'principal',principal,'penalty',penalty,'outstanding',outstanding));
  UPDATE public.operation_requests SET status='completed',completed_at=now(),
    result=jsonb_build_object('payment_id',receipt_id,'principal',principal,'penalty',penalty,'amount',cash_amount)
    WHERE id=request.id;
  RETURN receipt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.post_credit_payment(uuid,uuid,text,numeric,numeric,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_credit_payment(uuid,uuid,text,numeric,numeric,uuid,text,text) TO authenticated;
