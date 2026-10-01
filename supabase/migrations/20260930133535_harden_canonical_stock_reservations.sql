CREATE OR REPLACE FUNCTION public.reserve_stock(
  _tenant_id uuid, _warehouse_id uuid, _product_id uuid, _order_id uuid,
  _order_item_id uuid DEFAULT NULL, _quantity numeric DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  reservation_id uuid;
  available_quantity numeric;
  order_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id, 'warehouse', 'edit')
    OR private.has_module_access(_tenant_id, 'sales', 'edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
  SELECT status::text INTO order_status FROM public.orders
    WHERE id=_order_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF order_status IN ('cancelled','delivered') THEN RAISE EXCEPTION 'order_not_reservable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active)
    OR NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product_id AND tenant_id=_tenant_id) THEN
    RAISE EXCEPTION 'invalid_stock_scope';
  END IF;
  IF _order_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE id=_order_item_id AND order_id=_order_id
      AND tenant_id=_tenant_id AND product_id=_product_id
  ) THEN RAISE EXCEPTION 'invalid_order_item'; END IF;
  SELECT on_hand-reserved-COALESCE(problem_qty,0) INTO available_quantity
    FROM public.stock_balances WHERE tenant_id=_tenant_id
      AND warehouse_id=_warehouse_id AND product_id=_product_id FOR UPDATE;
  IF COALESCE(available_quantity,0)<_quantity THEN RAISE EXCEPTION 'insufficient_available_stock'; END IF;
  INSERT INTO public.stock_reservations(tenant_id,warehouse_id,product_id,order_id,order_item_id,quantity,status,created_by)
    VALUES (_tenant_id,_warehouse_id,_product_id,_order_id,_order_item_id,_quantity,'active',auth.uid())
    RETURNING id INTO reservation_id;
  UPDATE public.stock_balances SET reserved=reserved+_quantity,updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id AND product_id=_product_id;
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES (_tenant_id,_warehouse_id,_product_id,'reservation',_quantity,'stock_reservation',reservation_id,'Order reservation',auth.uid());
  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(_tenant_id uuid,_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE reservation_row public.stock_reservations%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id,'warehouse','edit')
    OR private.has_module_access(_tenant_id,'sales','edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  -- Match reserve's lock order: order, reservation, balance.
  PERFORM 1 FROM public.orders WHERE tenant_id=_tenant_id AND id=(
    SELECT order_id FROM public.stock_reservations WHERE id=_reservation_id AND tenant_id=_tenant_id
  ) FOR UPDATE;
  SELECT * INTO reservation_row FROM public.stock_reservations
    WHERE id=_reservation_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF reservation_row.status<>'active' THEN RETURN; END IF;
  UPDATE public.stock_balances SET reserved=reserved-reservation_row.quantity,updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=reservation_row.warehouse_id
      AND product_id=reservation_row.product_id AND reserved>=reservation_row.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_balance_mismatch'; END IF;
  UPDATE public.stock_reservations SET status='released',updated_at=now() WHERE id=_reservation_id;
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES (_tenant_id,reservation_row.warehouse_id,reservation_row.product_id,'release',-reservation_row.quantity,
      'stock_reservation',_reservation_id,'Reservation released',auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_stock(uuid,uuid,uuid,uuid,uuid,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.release_stock_reservation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid,uuid,uuid,uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stock_reservation(uuid,uuid) TO authenticated;
