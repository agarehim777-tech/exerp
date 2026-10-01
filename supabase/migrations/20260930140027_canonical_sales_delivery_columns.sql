-- Upgrade the deployed legacy body without replacing its journal/reversal logic.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.process_sales_order_status(uuid,text)'::regprocedure) INTO definition;
  IF position('canonical_delivery_columns' IN definition)>0 THEN RETURN; END IF;
  IF position('move_type,qty,unit_cost,reference,doc_no,note,created_by' IN definition)=0 THEN
    RAISE EXCEPTION 'unexpected_delivery_function_version';
  END IF;
  definition:=replace(definition,
    'move_type,qty,unit_cost,reference,doc_no,note,created_by',
    'movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by');
  definition:=replace(definition,'''out'',take,l.unit_cost,''sales_order:''||o.id,o.order_no',
    '''delivery'',-take,l.unit_cost,''sales_order'',o.id');
  definition:=replace(definition,'''out'',take,COALESCE(b.avg_cost,0),''sales_order:''||o.id,o.order_no',
    '''delivery'',-take,COALESCE(b.avg_cost,0),''sales_order'',o.id');
  definition:=replace(definition,'''in'',b.quantity,b.unit_cost,''sales_return:''||o.id,o.order_no',
    '''receipt'',b.quantity,b.unit_cost,''sales_return'',o.id');
  definition:=replace(definition,'ORDER BY on_hand DESC,id FOR UPDATE','ORDER BY warehouse_id FOR UPDATE');
  definition:=replace(definition,'UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE id=b.id;',
    'UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;');
  -- The receipt trigger calculates weighted average cost once, after the quantity update.
  definition:=replace(definition,
    'avg_cost=((COALESCE(oldq,0)*COALESCE(oldc,0))+(b.quantity*b.unit_cost))/NULLIF(COALESCE(oldq,0)+b.quantity,0),on_hand=',
    'on_hand=');
  definition:=replace(definition,'IF _status=''delivered'' THEN', $guard$
  -- canonical_delivery_columns
  IF o.status='cancelled' THEN
    IF _status='cancelled' THEN RETURN; END IF;
    RAISE EXCEPTION 'cancelled_order_is_terminal';
  END IF;
  IF _status='delivered' THEN$guard$);
  IF definition ~ 'move_type|doc_no|sales_order:''\|\|' THEN
    RAISE EXCEPTION 'legacy_delivery_columns_remain';
  END IF;
  EXECUTE definition;
END;
$migration$;
