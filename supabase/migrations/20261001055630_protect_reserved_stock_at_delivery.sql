DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.process_sales_order_status(uuid,text)'::regprocedure) INTO definition;
  IF position('protected_delivery_stock' IN definition)>0 THEN RETURN; END IF;
  IF position('canonical_delivery_columns' IN definition)=0 THEN
    RAISE EXCEPTION 'canonical_delivery_migration_required';
  END IF;
  definition:=replace(definition,'oldq numeric; oldc numeric;', 'oldq numeric; oldc numeric; available numeric;');
  definition:=replace(definition,'IF method=''fifo'' THEN', $locks$
   -- protected_delivery_stock: lock balances before cost layers in either valuation mode.
   PERFORM 1 FROM public.stock_balances WHERE tenant_id=o.tenant_id AND product_id=it.product_id
     ORDER BY warehouse_id FOR UPDATE;
   IF method='fifo' THEN$locks$);
  definition:=replace(definition,'EXIT WHEN need<=0; take:=LEAST(need,l.remaining_qty);', $fifo$
     EXIT WHEN need<=0;
     SELECT sb.on_hand-sb.reserved-COALESCE(sb.problem_qty,0)+COALESCE((
       SELECT sum(sr.quantity) FROM public.stock_reservations sr WHERE sr.tenant_id=o.tenant_id
         AND sr.order_id=o.id AND sr.warehouse_id=l.warehouse_id
         AND sr.product_id=it.product_id AND sr.status='active'
     ),0) INTO available FROM public.stock_balances sb WHERE sb.tenant_id=o.tenant_id
       AND sb.warehouse_id=l.warehouse_id AND sb.product_id=it.product_id;
     take:=LEAST(need,l.remaining_qty,GREATEST(COALESCE(available,0),0));
     IF take<=0 THEN CONTINUE; END IF;$fifo$);
  definition:=replace(definition,'EXIT WHEN need<=0; take:=LEAST(need,b.on_hand);', $average$
     EXIT WHEN need<=0;
     SELECT COALESCE(sum(sr.quantity),0) INTO available FROM public.stock_reservations sr
       WHERE sr.tenant_id=o.tenant_id AND sr.order_id=o.id AND sr.warehouse_id=b.warehouse_id
         AND sr.product_id=it.product_id AND sr.status='active';
     take:=LEAST(need,GREATEST(b.on_hand-b.reserved-COALESCE(b.problem_qty,0)+available,0));
     IF take<=0 THEN CONTINUE; END IF;$average$);
  IF position('take:=LEAST(need,b.on_hand)' IN definition)>0
    OR position('take:=LEAST(need,l.remaining_qty);' IN definition)>0 THEN
    RAISE EXCEPTION 'unexpected_stock_allocation_body';
  END IF;
  EXECUTE definition;
END;
$migration$;
