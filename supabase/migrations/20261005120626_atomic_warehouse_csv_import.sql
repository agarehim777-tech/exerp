ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS serial_tracked boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_nonnegative CHECK (cost_price>=0 AND cost_price::text NOT IN ('NaN','Infinity','-Infinity'));

CREATE FUNCTION public.import_warehouse_stock_atomic(_tenant_id uuid,_request_key text,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; item jsonb; product public.products%rowtype;
  warehouse_id uuid; quantity numeric; cost numeric; sale_price_value numeric; minimum numeric;
  item_sku text; product_name text; movement_id uuid; results jsonb := '[]'; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false)
    THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR jsonb_typeof(_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(_rows)<1 OR jsonb_array_length(_rows)>500 THEN RAISE EXCEPTION 'invalid_import_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'import_warehouse_stock_atomic',md5(_rows::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'import_warehouse_stock_atomic' OR req.request_hash<>md5(_rows::text)
    THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  -- Serialize catalog creation and acquire inventory locks in a stable order.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warehouse-import:'||_tenant_id::text,0));
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  FOR item IN SELECT value FROM jsonb_array_elements(_rows) WITH ORDINALITY rows(value,position)
    ORDER BY value->>'warehouseId',value->>'sku',position LOOP
    warehouse_id := (item->>'warehouseId')::uuid;
    quantity := (item->>'qty')::numeric; cost := (item->>'costPrice')::numeric;
    sale_price_value := (item->>'salePrice')::numeric; minimum := (item->>'reorderLevel')::numeric;
    item_sku := nullif(upper(trim(item->>'sku')),''); product_name := nullif(trim(item->>'product'),'');
    IF product_name IS NULL OR length(product_name)>300 OR length(item_sku)>120 OR quantity IS NULL OR quantity<=0
      OR quantity::text IN ('NaN','Infinity','-Infinity')
      OR cost<0 OR cost::text IN ('NaN','Infinity','-Infinity')
      OR sale_price_value<0 OR sale_price_value::text IN ('NaN','Infinity','-Infinity')
      OR minimum<0 OR minimum::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_import_row'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse_id AND tenant_id=_tenant_id AND is_active)
      THEN RAISE EXCEPTION 'invalid_stock_scope'; END IF;
    SELECT * INTO product FROM public.products WHERE tenant_id=_tenant_id
      AND CASE WHEN item_sku IS NOT NULL THEN products.sku=item_sku ELSE name=product_name END ORDER BY id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF product.currency<>'AZN' OR NOT product.is_active THEN RAISE EXCEPTION 'invalid_import_product'; END IF;
      UPDATE public.products SET price=coalesce(sale_price_value,products.price),
        cost_price=coalesce(cost,products.cost_price),minimum_stock=coalesce(minimum,products.minimum_stock),
        serial_tracked=coalesce((item->>'serialTracked')::boolean,products.serial_tracked),
        description=coalesce(nullif(item->>'category',''),products.description),unit=coalesce(nullif(item->>'unit',''),products.unit),updated_at=now()
        WHERE id=product.id AND tenant_id=_tenant_id RETURNING * INTO product;
    ELSE
      INSERT INTO public.products(tenant_id,sku,name,description,unit,price,cost_price,minimum_stock,serial_tracked,currency,created_by)
        VALUES(_tenant_id,coalesce(item_sku,'IMP-'||gen_random_uuid()::text),product_name,nullif(item->>'category',''),
          coalesce(nullif(item->>'unit',''),'pcs'),coalesce(sale_price_value,0),coalesce(cost,0),coalesce(minimum,0),
          coalesce((item->>'serialTracked')::boolean,false),'AZN',auth.uid()) RETURNING * INTO product;
    END IF;
    movement_id := public.receive_stock(_tenant_id,warehouse_id,product.id,quantity,coalesce(cost,product.cost_price),
      'csv_import',req.id,'CSV stock import');
    results := results||jsonb_build_array(jsonb_build_object('product_id',product.id,'warehouse_id',warehouse_id,
      'movement_id',movement_id,'quantity',quantity));
  END LOOP;
  result_payload := jsonb_build_object('request_id',req.id,'rows',results,'row_count',jsonb_array_length(results));
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse','csv_import','CSV stock import completed',result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.import_warehouse_stock_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_warehouse_stock_atomic(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
