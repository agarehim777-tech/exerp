-- A warehouse delivery is an inventory issue, not only an order status change.
-- Close the linked reservations and reduce physical stock in one transaction.
CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  fulfilled_count integer := 0;
BEGIN
  SELECT * INTO target
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF target.id IS NULL OR NOT (
    private.has_module_access(target.tenant_id, 'delivery', 'edit')
    OR private.has_module_access(target.tenant_id, 'warehouse', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  FOR reservation_row IN
    SELECT *
      FROM public.stock_reservations
     WHERE order_id = target.id
       AND tenant_id = target.tenant_id
       AND status = 'active'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET on_hand = on_hand - reservation_row.quantity,
           reserved = reserved - reservation_row.quantity,
           updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id
       AND on_hand >= reservation_row.quantity
       AND reserved >= reservation_row.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Təhvil üçün stok və rezerv qalığı uyğun deyil';
    END IF;

    UPDATE public.stock_reservations
       SET status = 'fulfilled', updated_at = now()
     WHERE id = reservation_row.id;

    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id, note, created_by
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id,
      reservation_row.product_id, 'delivery', -reservation_row.quantity,
      'sales_order', target.id, target.order_no || ' sifarişi təhvil verildi', auth.uid()
    );

    fulfilled_count := fulfilled_count + 1;
  END LOOP;

  -- Repeated calls after a completed delivery are harmless. A new order with
  -- no reservation, however, must never be marked as delivered.
  IF fulfilled_count = 0 THEN
    IF target.status::text = 'delivered' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Sifariş üzrə aktiv anbar rezervi tapılmadı';
  END IF;

  UPDATE public.orders
     SET status = 'delivered'::public.order_status, updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'deliveries', 'complete',
    target.order_no || ' təhvil verildi',
    jsonb_build_object('order_id', target.id, 'fulfilled_reservations', fulfilled_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated, service_role;

-- Repair deliveries completed while the previous function only changed the
-- order status. Active reservations are the exact marker of that inconsistency.
DO $$
DECLARE
  target record;
  reservation_row public.stock_reservations%rowtype;
  repaired_count integer;
BEGIN
  FOR target IN
    SELECT o.id, o.tenant_id, o.order_no
      FROM public.orders o
     WHERE o.status::text = 'delivered'
       AND EXISTS (
         SELECT 1 FROM public.stock_reservations r
          WHERE r.order_id = o.id AND r.status = 'active'
       )
     FOR UPDATE
  LOOP
    repaired_count := 0;
    FOR reservation_row IN
      SELECT * FROM public.stock_reservations
       WHERE order_id = target.id AND tenant_id = target.tenant_id AND status = 'active'
       ORDER BY created_at, id
       FOR UPDATE
    LOOP
      UPDATE public.stock_balances
         SET on_hand = on_hand - reservation_row.quantity,
             reserved = reserved - reservation_row.quantity,
             updated_at = now()
       WHERE tenant_id = reservation_row.tenant_id
         AND warehouse_id = reservation_row.warehouse_id
         AND product_id = reservation_row.product_id
         AND on_hand >= reservation_row.quantity
         AND reserved >= reservation_row.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Keçmiş təhvil üçün stok və rezerv qalığı uyğun deyil: %', target.order_no;
      END IF;

      UPDATE public.stock_reservations
         SET status = 'fulfilled', updated_at = now()
       WHERE id = reservation_row.id;

      INSERT INTO public.stock_movements(
        tenant_id, warehouse_id, product_id, movement_type, quantity,
        reference_type, reference_id, note, created_by
      ) VALUES (
        reservation_row.tenant_id, reservation_row.warehouse_id,
        reservation_row.product_id, 'delivery', -reservation_row.quantity,
        'sales_order', target.id, target.order_no || ' keçmiş təhvil düzəlişi',
        reservation_row.created_by
      );
      repaired_count := repaired_count + 1;
    END LOOP;

    INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
    VALUES (
      gen_random_uuid()::text, target.tenant_id, reservation_row.created_by,
      'deliveries', 'stock_reconciliation',
      target.order_no || ' təhvil qalığı düzəldildi',
      jsonb_build_object('order_id', target.id, 'fulfilled_reservations', repaired_count)
    );
  END LOOP;
END;
$$;
