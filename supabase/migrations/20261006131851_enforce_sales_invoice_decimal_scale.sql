-- Match numeric(18,3) quantity and two-decimal price/rates before calculating totals.
CREATE OR REPLACE FUNCTION public.create_sales_invoice_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  invoice_id uuid := gen_random_uuid();
  customer_id uuid;
  source_order_id uuid;
  invoice_no text;
  business_date date;
  due_date date;
  currency_value text;
  source_order public.orders%rowtype;
  line jsonb;
  line_number integer := 0;
  product_id uuid;
  quantity numeric;
  price numeric;
  discount numeric;
  vat_rate numeric;
  net numeric;
  vat numeric;
  net_total numeric := 0;
  vat_total_value numeric := 0;
  gross_total numeric;
  paid numeric := 0;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'invoices','edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'create_sales_invoice_atomic',md5(_payload::text))
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF request.operation<>'create_sales_invoice_atomic' OR request.request_hash<>md5(_payload::text) THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  business_date := coalesce(nullif(_payload->>'invoice_date','')::date,(now() AT TIME ZONE 'Asia/Baku')::date);
  due_date := nullif(_payload->>'due_date','')::date;
  IF due_date<business_date THEN RAISE EXCEPTION 'invalid_due_date'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  currency_value := coalesce(nullif(_payload->>'currency',''),'AZN');
  IF currency_value<>'AZN' THEN RAISE EXCEPTION 'invoice_currency_not_supported'; END IF;
  customer_id := nullif(_payload->>'customer_id','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.tenant_id=_tenant_id) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;
  source_order_id := nullif(_payload->>'order_id','')::uuid;
  IF source_order_id IS NOT NULL THEN
    SELECT * INTO source_order FROM public.orders o WHERE o.id=source_order_id AND o.tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
    IF source_order.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
    IF source_order.customer_id IS DISTINCT FROM customer_id OR source_order.currency<>currency_value THEN
      RAISE EXCEPTION 'invoice_order_mismatch';
    END IF;
    IF EXISTS(SELECT 1 FROM public.sales_invoices i WHERE i.tenant_id=_tenant_id AND i.order_id=source_order_id AND i.status::text<>'cancelled') THEN
      RAISE EXCEPTION 'order_already_invoiced';
    END IF;
    paid := source_order.paid_amount;
  END IF;
  -- Serialize number allocation as well as user-entered duplicate numbers.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-number:'||_tenant_id::text,0));
  invoice_no := coalesce(nullif(trim(_payload->>'invoice_no'),''),
    public.generate_doc_number(_tenant_id,'INV','sales_invoices','invoice_no'));
  INSERT INTO public.sales_invoices(id,tenant_id,invoice_no,customer_id,order_id,invoice_date,due_date,currency,notes,created_by)
    VALUES(invoice_id,_tenant_id,invoice_no,customer_id,source_order_id,business_date,due_date,currency_value,_payload->>'notes',auth.uid());
  FOR line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_invoice_line'; END IF;
    quantity := (line->>'qty')::numeric;
    price := (line->>'unit_price')::numeric;
    discount := coalesce(nullif(line->>'discount_pct','')::numeric,0);
    vat_rate := coalesce(nullif(line->>'vat_rate','')::numeric,0);
    IF quantity IS NULL OR price IS NULL OR quantity<=0 OR price<0 OR discount NOT BETWEEN 0 AND 100
      OR vat_rate NOT BETWEEN 0 AND 100 OR quantity::text IN('NaN','Infinity','-Infinity')
      OR price::text IN('NaN','Infinity','-Infinity') OR discount::text IN('NaN','Infinity','-Infinity')
      OR vat_rate::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_invoice_amount'; END IF;
    IF quantity<>round(quantity,3) OR price<>round(price,2)
      OR discount<>round(discount,2) OR vat_rate<>round(vat_rate,2) THEN
      RAISE EXCEPTION 'invalid_invoice_precision';
    END IF;
    product_id := nullif(line->>'product_id','')::uuid;
    IF product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p
      WHERE p.id=product_id AND p.tenant_id=_tenant_id AND p.is_active) THEN RAISE EXCEPTION 'product_not_found'; END IF;
    net := round(quantity*price*(1-discount/100),2);
    vat := round(net*vat_rate/100,2);
    net_total := net_total+net;
    vat_total_value := vat_total_value+vat;
    line_number := line_number+1;
    INSERT INTO public.sales_invoice_lines(tenant_id,invoice_id,product_id,line_no,description,qty,unit_price,discount_pct,vat_rate,line_total)
      VALUES(_tenant_id,invoice_id,product_id,line_number,line->>'description',quantity,price,discount,vat_rate,net+vat);
  END LOOP;
  gross_total := net_total+vat_total_value;
  IF gross_total<=0 THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  IF source_order_id IS NOT NULL AND (gross_total<>round(source_order.total,2) OR vat_total_value<>round(source_order.vat_total,2)) THEN
    RAISE EXCEPTION 'invoice_order_totals_mismatch';
  END IF;
  UPDATE public.sales_invoices SET subtotal=net_total,vat_total=vat_total_value,total=gross_total,paid_amount=paid,
    status=CASE WHEN paid>=gross_total THEN 'paid'::public.sales_invoice_status
      WHEN paid>0 THEN 'partial'::public.sales_invoice_status ELSE 'draft'::public.sales_invoice_status END
    WHERE id=invoice_id;
  result_payload := jsonb_build_object('invoice_id',invoice_id,'invoice_no',invoice_no,'total',gross_total,'vat_total',vat_total_value);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'invoices','invoice_created',invoice_no,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END $$;
