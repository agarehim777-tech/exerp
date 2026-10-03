CREATE OR REPLACE FUNCTION public.complete_sales_delivery(
  _tenant_id uuid, _order_id uuid, _warehouse_id uuid, _request_key text, _acceptance jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  sale public.orders%rowtype;
  payload_hash text;
  result_payload jsonb;
  delivery_id uuid;
  accepted_time timestamptz := now();
  recipient text := nullif(trim(_acceptance->>'recipientName'),'');
  document_no text := nullif(trim(_acceptance->>'documentNo'),'');
  employee_name text := nullif(trim(_acceptance->>'warehouseEmployeeName'),'');
BEGIN
  IF auth.uid() IS NULL OR NOT (
    coalesce(private.has_module_access(_tenant_id,'deliveries','edit'),false) OR
    coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false)
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_acceptance) IS DISTINCT FROM 'object' OR recipient IS NULL OR document_no IS NULL
    OR employee_name IS NULL OR (_acceptance->>'signatureConfirmed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'delivery_acceptance_required';
  END IF;
  payload_hash := md5(jsonb_build_object('order_id',_order_id,'warehouse_id',_warehouse_id,'acceptance',_acceptance)::text);
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,trim(_request_key),'complete_sales_delivery',payload_hash)
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=trim(_request_key) FOR UPDATE;
  IF request.operation<>'complete_sales_delivery' OR request.request_hash<>payload_hash THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  SELECT * INTO sale FROM public.orders WHERE tenant_id=_tenant_id AND id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF sale.status='cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
  IF sale.status='delivered' THEN RAISE EXCEPTION 'order_already_delivered'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active) THEN
    RAISE EXCEPTION 'warehouse_not_found';
  END IF;
  IF EXISTS(SELECT 1 FROM public.stock_reservations WHERE tenant_id=_tenant_id AND order_id=_order_id AND status='active'
    AND warehouse_id<>_warehouse_id) OR EXISTS(SELECT 1 FROM public.deliveries WHERE tenant_id=_tenant_id AND order_id=_order_id
    AND warehouse_id<>_warehouse_id) THEN RAISE EXCEPTION 'delivery_warehouse_mismatch'; END IF;
  -- Persist the warehouse constraint before the existing cost/stock posting command runs.
  INSERT INTO public.deliveries(tenant_id,order_id,warehouse_id,delivery_no,status,
    recipient_name,recipient_document,acceptance_name,acceptance_document_no,acceptance_signature,
    acceptance_note,warehouse_employee_name,accepted_at,created_by)
    VALUES(_tenant_id,_order_id,_warehouse_id,'TV-'||sale.order_no,
      CASE WHEN sale.status='delivered' THEN 'delivered' ELSE 'ready' END,
      recipient,document_no,recipient,document_no,'confirmed',
      jsonb_build_object('note',coalesce(_acceptance->>'note',''),'warehouseEmployeeName',employee_name)::text,
      employee_name,accepted_time,auth.uid())
    ON CONFLICT(tenant_id,order_id) DO UPDATE SET
      warehouse_id=excluded.warehouse_id,status=excluded.status,
      recipient_name=excluded.recipient_name,recipient_document=excluded.recipient_document,
      acceptance_name=excluded.acceptance_name,acceptance_document_no=excluded.acceptance_document_no,
      acceptance_signature=excluded.acceptance_signature,acceptance_note=excluded.acceptance_note,
      warehouse_employee_name=excluded.warehouse_employee_name,accepted_at=excluded.accepted_at
    RETURNING id INTO delivery_id;
  PERFORM public.mark_sales_order_delivered(_order_id);
  UPDATE public.deliveries SET status='delivered',delivered_at=accepted_time,delivered_by=auth.uid(),updated_at=now()
    WHERE id=delivery_id AND tenant_id=_tenant_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'deliveries','complete',sale.order_no||' delivery accepted',
      jsonb_build_object('order_id',_order_id,'delivery_id',delivery_id,'warehouse_id',_warehouse_id));
  result_payload := jsonb_build_object('order_id',_order_id,'delivery_id',delivery_id,'status','delivered','accepted_at',accepted_time);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_sales_delivery(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_sales_delivery(uuid,uuid,uuid,text,jsonb) TO authenticated;
