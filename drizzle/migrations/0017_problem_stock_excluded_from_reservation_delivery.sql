CREATE OR REPLACE FUNCTION public.reserve_stock(_tenant_id uuid, _warehouse_id uuid, _product_id uuid, _order_id uuid, _order_item_id uuid DEFAULT NULL::uuid, _quantity numeric DEFAULT 0)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE
  reservation_id UUID;
  available_quantity NUMERIC(14,3);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id, 'warehouse', 'edit')
    OR private.has_module_access(_tenant_id, 'sales', 'edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  -- Quarantined (problem) stock is not sellable: available = on_hand - reserved - problem_qty.
  SELECT COALESCE(on_hand,0) - COALESCE(reserved,0) - COALESCE(problem_qty,0) INTO available_quantity
    FROM public.stock_balances
   WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id AND product_id = _product_id
   FOR UPDATE;

  IF available_quantity IS NULL OR available_quantity < _quantity THEN
    RAISE EXCEPTION 'insufficient_available_stock: tələb % , satışa yararlı qalıq %', _quantity, COALESCE(available_quantity,0);
  END IF;

  INSERT INTO public.stock_reservations(tenant_id, warehouse_id, product_id, order_id, quantity, status, created_by)
  VALUES (_tenant_id, _warehouse_id, _product_id, _order_id, _quantity, 'active', auth.uid())
  RETURNING id INTO reservation_id;

  UPDATE public.stock_balances SET reserved = COALESCE(reserved,0) + _quantity, updated_at = now()
   WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id AND product_id = _product_id;

  INSERT INTO public.stock_movements(tenant_id, warehouse_id, product_id, movement_type, quantity,
    move_type, qty, reference_type, reference_id, note, created_by)
  VALUES (_tenant_id, _warehouse_id, _product_id, 'reservation', _quantity,
    'adjust', 0, 'stock_reservation', reservation_id, 'Satış sifarişi üzrə rezerv', auth.uid());

  RETURN reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  fulfilled_count integer := 0;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL OR NOT (
    private.has_module_access(target.tenant_id, 'delivery', 'edit')
    OR private.has_module_access(target.tenant_id, 'warehouse', 'edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations
     WHERE order_id = target.id AND tenant_id = target.tenant_id AND status = 'active'
     ORDER BY created_at, id FOR UPDATE
  LOOP
    -- Delivery may only consume sellable stock; quarantined units stay in the warehouse.
    UPDATE public.stock_balances
       SET on_hand = on_hand - reservation_row.quantity,
           reserved = reserved - reservation_row.quantity,
           updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id
       AND on_hand - COALESCE(problem_qty,0) >= reservation_row.quantity
       AND reserved >= reservation_row.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient_available_stock: təhvil üçün satışa yararlı stok və rezerv uyğun deyil (problemli mallar təhvil verilə bilməz)';
    END IF;

    UPDATE public.stock_reservations SET status = 'fulfilled', updated_at = now() WHERE id = reservation_row.id;

    INSERT INTO public.stock_movements(tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id, note, created_by)
    VALUES (reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id, 'delivery',
      -reservation_row.quantity, 'sales_order', target.id, target.order_no || ' sifarişi təhvil verildi', auth.uid());
    fulfilled_count := fulfilled_count + 1;
  END LOOP;

  IF fulfilled_count = 0 THEN
    IF target.status::text = 'delivered' THEN RETURN; END IF;
    RAISE EXCEPTION 'Sifariş üzrə aktiv anbar rezervi tapılmadı';
  END IF;

  UPDATE public.orders SET status = 'delivered'::public.order_status, updated_at = now() WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (gen_random_uuid()::text, target.tenant_id, auth.uid(), 'deliveries', 'complete',
    target.order_no || ' təhvil verildi',
    jsonb_build_object('order_id', target.id, 'fulfilled_reservations', fulfilled_count));
END;
$function$;