CREATE OR REPLACE FUNCTION public.edit_sales_order_atomic(_tenant_id uuid, _request_key text, _order_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  target public.orders%rowtype;
  line public.order_items%rowtype;
  item jsonb;
  payload_hash text := md5(jsonb_build_object('order_id',_order_id,'payload',_payload)::text);
  result_payload jsonb;
  price numeric; discount numeric; vat numeric; net numeric; tax numeric;
  net_total numeric := 0; v_tax_total numeric := 0; v_discount_total numeric := 0;
  customer uuid; order_day date;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'sales','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(_payload->'items')=0 THEN RAISE EXCEPTION 'invalid_sales_edit'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,trim(_request_key),'edit_sales_order_atomic',payload_hash) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=trim(_request_key) FOR UPDATE;
  IF request.operation<>'edit_sales_order_atomic' OR request.request_hash<>payload_hash THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  SELECT * INTO target FROM public.orders WHERE id=_order_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF nullif(_payload->>'expected_updated_at','') IS NULL OR target.updated_at IS DISTINCT FROM (_payload->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'stale_sales_edit'; END IF;
  IF target.status::text NOT IN ('draft','pending','confirmed') OR coalesce(target.paid_amount,0)>0
    OR EXISTS(SELECT 1 FROM public.deliveries WHERE tenant_id=_tenant_id AND order_id=_order_id AND status::text<>'cancelled')
    OR EXISTS(SELECT 1 FROM public.sales_invoices WHERE tenant_id=_tenant_id AND order_id=_order_id AND status::text<>'cancelled') THEN
    RAISE EXCEPTION 'posted_sales_edit_requires_reversal';
  END IF;
  PERFORM 1 FROM public.credit_contracts WHERE tenant_id=_tenant_id AND order_id=_order_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.credit_contracts WHERE tenant_id=_tenant_id AND order_id=_order_id
    AND (status NOT IN ('draft','pending') OR initial_payment>0)) THEN RAISE EXCEPTION 'active_credit_edit_requires_reversal'; END IF;
  IF (_payload->>'currency') IS DISTINCT FROM target.currency THEN RAISE EXCEPTION 'sales_currency_edit_requires_reversal'; END IF;
  customer := (_payload->>'customer_id')::uuid;
  order_day := (_payload->>'order_date')::date;
  IF customer IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=customer AND tenant_id=_tenant_id) OR order_day IS NULL THEN RAISE EXCEPTION 'invalid_sales_header'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,target.order_date);
  PERFORM private.assert_open_accounting_period(_tenant_id,order_day);
  PERFORM 1 FROM public.order_items WHERE tenant_id=_tenant_id AND order_id=_order_id ORDER BY id FOR UPDATE;
  IF jsonb_array_length(_payload->'items')<>(SELECT count(*) FROM public.order_items WHERE tenant_id=_tenant_id AND order_id=_order_id)
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(_payload->'items'))<>jsonb_array_length(_payload->'items') THEN RAISE EXCEPTION 'sales_lines_edit_requires_reversal'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_payload->'items') LOOP
    SELECT * INTO line FROM public.order_items WHERE id=(item->>'id')::uuid AND tenant_id=_tenant_id AND order_id=_order_id;
    IF NOT FOUND OR line.product_id IS DISTINCT FROM nullif(item->>'product_id','')::uuid
      OR line.qty IS DISTINCT FROM (item->>'qty')::numeric THEN RAISE EXCEPTION 'sales_lines_edit_requires_reversal'; END IF;
    price := (item->>'unit_price')::numeric;
    discount := coalesce((item->>'discount_pct')::numeric,0);
    vat := coalesce((item->>'vat_rate')::numeric,0);
    IF price IS NULL OR price<0 OR discount<0 OR discount>100 OR vat<0 OR vat>100
      OR price::text IN ('NaN','Infinity','-Infinity') OR discount::text IN ('NaN','Infinity','-Infinity')
      OR vat::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_sales_price'; END IF;
    net := round(line.qty*price*(1-discount/100),2);
    tax := round(net*vat/100,2);
    net_total := net_total+net; v_tax_total := v_tax_total+tax;
    v_discount_total := v_discount_total+round(line.qty*price,2)-net;
    UPDATE public.order_items SET unit_price=price,discount_pct=discount,vat_rate=vat,tax_rate=vat,
      description=item->>'description',line_total=net+tax WHERE id=line.id AND tenant_id=_tenant_id;
  END LOOP;
  IF net_total+v_tax_total<=0 OR EXISTS(SELECT 1 FROM public.credit_contracts WHERE tenant_id=_tenant_id AND order_id=_order_id AND required_initial>=net_total+v_tax_total) THEN RAISE EXCEPTION 'sales_total_below_deposit_target'; END IF;
  UPDATE public.orders SET customer_id=customer,order_date=order_day,notes=_payload->>'notes',subtotal=net_total,
    vat_total=v_tax_total,tax_total=v_tax_total,discount_total=v_discount_total,total=net_total+v_tax_total,updated_at=now()
    WHERE id=_order_id AND tenant_id=_tenant_id;
  UPDATE public.credit_contracts SET principal=net_total+v_tax_total,customer_id=customer
    WHERE tenant_id=_tenant_id AND order_id=_order_id;
  result_payload:=jsonb_build_object('order_id',_order_id,'total',net_total+v_tax_total,'request_key',trim(_request_key));
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'sales','atomic_edit',target.order_no,
      jsonb_build_object('before',to_jsonb(target),'result',result_payload));
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_sales_order_atomic(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_sales_order_atomic(uuid,text,uuid,jsonb) TO authenticated,service_role;
