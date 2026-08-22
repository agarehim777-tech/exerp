CREATE OR REPLACE FUNCTION public.create_sales_order_atomic(_tenant_id uuid, _request_key text, _order_no text, _customer_id uuid, _order_date date, _currency text, _notes text, _items jsonb, _credit jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  request_record public.operation_requests%rowtype;
  payload_hash text;
  created_order_id uuid;
  credit_id uuid;
  item jsonb;
  order_item_id uuid;
  reservation_id uuid;
  item_index integer := 0;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF trim(COALESCE(_request_key, '')) = '' OR length(_request_key) > 160 THEN
    RAISE EXCEPTION 'invalid_request_key';
  END IF;

  payload_hash := md5(jsonb_build_object(
    'order_no', _order_no, 'customer_id', _customer_id, 'order_date', _order_date,
    'currency', _currency, 'notes', _notes, 'items', _items, 'credit', _credit
  )::text);

  INSERT INTO public.operation_requests(tenant_id, request_key, operation, request_hash)
  VALUES (_tenant_id, trim(_request_key), 'create_sales_order_atomic', payload_hash)
  ON CONFLICT (tenant_id, request_key) DO NOTHING;

  SELECT * INTO request_record
  FROM public.operation_requests
  WHERE tenant_id = _tenant_id AND request_key = trim(_request_key)
  FOR UPDATE;

  IF request_record.request_hash <> payload_hash THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request_record.status = 'completed' THEN
    RETURN request_record.result;
  END IF;

  PERFORM private.assert_open_accounting_period(_tenant_id, COALESCE(_order_date, current_date));
  created_order_id := public.create_sales_order(
    _tenant_id, _order_no, _customer_id, _order_date, _currency, _notes, _items
  );

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_index := item_index + 1;
    IF NULLIF(item->>'warehouse_id', '') IS NOT NULL THEN
      SELECT id INTO order_item_id
      FROM public.order_items
      WHERE tenant_id = _tenant_id AND order_id = created_order_id
        AND line_no = COALESCE((item->>'line_no')::integer, item_index)
      LIMIT 1;

      reservation_id := public.reserve_stock(
        _tenant_id,
        (item->>'warehouse_id')::uuid,
        (item->>'product_id')::uuid,
        created_order_id,
        order_item_id,
        (item->>'qty')::numeric
      );
    END IF;
  END LOOP;

  IF _credit IS NOT NULL THEN
    credit_id := public.create_credit_contract(
      _tenant_id,
      _credit->>'contract_no',
      _customer_id,
      created_order_id,
      (_credit->>'principal')::numeric,
      COALESCE((_credit->>'initial_payment')::numeric, 0),
      (_credit->>'term_months')::integer,
      COALESCE((_credit->>'start_date')::date, _order_date, current_date),
      NULLIF(_credit->>'required_initial', '')::numeric
    );
  END IF;

  result_payload := jsonb_build_object(
    'order_id', created_order_id,
    'credit_id', credit_id,
    'request_key', trim(_request_key)
  );

  UPDATE public.operation_requests
  SET status = 'completed', result = result_payload, completed_at = now()
  WHERE id = request_record.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'sales', 'atomic_create',
    trim(_order_no) || ' atomik sifariş axını tamamlandı', result_payload
  );

  RETURN result_payload;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_credit_contract(uuid, text, uuid, uuid, numeric, numeric, integer, date);