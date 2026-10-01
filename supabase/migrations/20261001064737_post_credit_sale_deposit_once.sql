CREATE OR REPLACE FUNCTION public.create_sales_order_complete(
  _tenant_id uuid, _request_key text, _order_no text, _customer_id uuid,
  _order_date date, _currency text, _notes text, _items jsonb,
  _credit jsonb DEFAULT NULL, _bonus_allocations jsonb DEFAULT '[]'::jsonb,
  _initial_payment numeric DEFAULT 0, _account_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  payload_hash text;
  result_payload jsonb;
  created_order_id uuid;
  created_credit_id uuid;
  payment_id uuid;
  resolved_account_id uuid;
  credit_payload jsonb := _credit;
  paid_initial numeric := round(coalesce(_initial_payment,0),2);
  target_initial numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'sales','edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF coalesce(_initial_payment,0)<0 OR _initial_payment::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_initial_payment'; END IF;
  IF jsonb_typeof(coalesce(_bonus_allocations,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'invalid_bonus_allocations'; END IF;
  payload_hash := md5(jsonb_build_object('order_no',_order_no,'customer_id',_customer_id,
    'order_date',_order_date,'currency',_currency,'notes',_notes,'items',_items,'credit',_credit,
    'bonus_allocations',_bonus_allocations,'initial_payment',_initial_payment,'account_id',_account_id)::text);
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,trim(_request_key),'create_sales_order_complete',payload_hash)
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests
    WHERE tenant_id=_tenant_id AND request_key=trim(_request_key) FOR UPDATE;
  IF request.operation<>'create_sales_order_complete' OR request.request_hash<>payload_hash THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;

  IF credit_payload IS NOT NULL THEN
    IF jsonb_typeof(credit_payload)<>'object' THEN RAISE EXCEPTION 'invalid_credit_payload'; END IF;
    IF round(coalesce((credit_payload->>'initial_payment')::numeric,paid_initial),2) IS DISTINCT FROM paid_initial THEN
      RAISE EXCEPTION 'credit_initial_payment_mismatch';
    END IF;
    target_initial := round(coalesce((credit_payload->>'required_initial')::numeric,paid_initial),2);
    IF target_initial<paid_initial OR target_initial::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'invalid_initial_payment_target';
    END IF;
    -- Create an unpaid draft; the explicit-account payment command owns collection.
    credit_payload := credit_payload || jsonb_build_object('initial_payment',0,'required_initial',target_initial);
  END IF;
  IF paid_initial>0 THEN
    SELECT id INTO resolved_account_id FROM public.cash_accounts
      WHERE id=_account_id AND tenant_id=_tenant_id AND is_active;
    IF _account_id IS NOT NULL AND resolved_account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
    IF resolved_account_id IS NULL THEN resolved_account_id:=private.ensure_main_cash_account(_tenant_id,_currency); END IF;
  END IF;
  result_payload:=public.create_sales_order_atomic(_tenant_id,'sales-core:'||md5(trim(_request_key)),
    _order_no,_customer_id,_order_date,_currency,_notes,coalesce(_items,'[]'::jsonb),credit_payload);
  created_order_id:=(result_payload->>'order_id')::uuid;
  created_credit_id:=(result_payload->>'credit_id')::uuid;
  IF credit_payload IS NOT NULL AND created_credit_id IS NULL THEN RAISE EXCEPTION 'credit_creation_failed'; END IF;
  IF jsonb_array_length(coalesce(_bonus_allocations,'[]'::jsonb))>0 THEN
    PERFORM public.set_order_bonus_assignments(created_order_id,coalesce(_order_date,current_date),_bonus_allocations,'Order creation');
  END IF;
  IF paid_initial>0 THEN
    IF created_credit_id IS NOT NULL THEN
      PERFORM public.post_credit_initial_payment(_tenant_id,created_credit_id,paid_initial,resolved_account_id,'Order creation');
      SELECT id INTO payment_id FROM public.cash_transactions
        WHERE tenant_id=_tenant_id AND account_id=resolved_account_id
          AND reference_id=created_order_id AND direction='in'
        ORDER BY created_at DESC,id DESC LIMIT 1;
    ELSE
      payment_id:=public.register_order_payment(created_order_id,paid_initial,resolved_account_id);
    END IF;
  END IF;
  result_payload:=result_payload||jsonb_build_object('request_key',trim(_request_key),'initial_payment_id',payment_id,'schema_version',3);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.create_sales_order_complete(uuid,text,text,uuid,date,text,text,jsonb,jsonb,jsonb,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_complete(uuid,text,text,uuid,date,text,text,jsonb,jsonb,jsonb,numeric,uuid) TO authenticated,service_role;
