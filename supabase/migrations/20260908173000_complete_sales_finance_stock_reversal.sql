-- Make sales cancellation the single atomic compensation boundary for stock,
-- delivery, credit and cash. The links are structural, not text-only.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reversal_of uuid
  REFERENCES public.stock_movements(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_one_reversal_idx
  ON public.stock_movements(reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reverse_sales_order(
  _order_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  movement_row public.stock_movements%rowtype;
  payment_row public.cash_transactions%rowtype;
  reversal_ids uuid[] := ARRAY[]::uuid[];
  reversal_id uuid;
  stock_reversal_count integer := 0;
  released_reservation_count integer := 0;
  credit_count integer := 0;
BEGIN
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO target
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT private.has_module_access(target.tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'Bu satışın ləğvi üçün icazəniz yoxdur';
  END IF;
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Bu satışın ləğvi üçün icazəniz yoxdur';
  END IF;

  -- Active reservations never left the warehouse; release only their reserved qty.
  FOR reservation_row IN
    SELECT *
      FROM public.stock_reservations
     WHERE order_id = target.id
       AND tenant_id = target.tenant_id
       AND status = 'active'
     FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = greatest(0, reserved - reservation_row.quantity),
           updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
    released_reservation_count := released_reservation_count + 1;
  END LOOP;

  UPDATE public.stock_reservations
     SET status = 'released', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status = 'active';

  -- Fulfilled reservations did leave stock. Restore each outbound movement once.
  FOR movement_row IN
    SELECT movement.*
      FROM public.stock_movements movement
     WHERE movement.tenant_id = target.tenant_id
       AND movement.movement_type = 'delivery'
       AND movement.quantity < 0
       AND (
         (movement.reference_type = 'sales_order' AND movement.reference_id = target.id)
         OR
         (movement.reference_type = 'delivery' AND movement.reference_id IN (
           SELECT delivery.id FROM public.deliveries delivery
            WHERE delivery.order_id = target.id
              AND delivery.tenant_id = target.tenant_id
         ))
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements reversal
          WHERE reversal.reversal_of = movement.id
       )
     FOR UPDATE
  LOOP
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, note, created_by, reversal_of
    ) VALUES (
      movement_row.tenant_id, movement_row.warehouse_id, movement_row.product_id,
      'receipt', abs(movement_row.quantity), movement_row.unit_cost,
      'sales_cancellation', target.id,
      target.order_no || ' satışının ləğvi ilə anbara qaytarıldı',
      coalesce(auth.uid(), movement_row.created_by), movement_row.id
    );

    UPDATE public.stock_balances
       SET on_hand = on_hand + abs(movement_row.quantity), updated_at = now()
     WHERE tenant_id = movement_row.tenant_id
       AND warehouse_id = movement_row.warehouse_id
       AND product_id = movement_row.product_id;
    stock_reversal_count := stock_reversal_count + 1;
  END LOOP;

  UPDATE public.stock_reservations
     SET status = 'released', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status = 'fulfilled';

  UPDATE public.deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status <> 'cancelled';

  UPDATE public.inventory_units
     SET status = 'available', updated_at = now()
   WHERE tenant_id = target.tenant_id
     AND status IN ('reserved', 'issued', 'sold')
     AND (
       source_id = target.id
       OR source_id IN (
         SELECT delivery.id FROM public.deliveries delivery
          WHERE delivery.order_id = target.id
            AND delivery.tenant_id = target.tenant_id
       )
     );

  UPDATE public.sales_bonus_entries
     SET status = 'reversed', reversed_at = coalesce(reversed_at, now())
   WHERE order_id = target.id AND status <> 'reversed';

  UPDATE public.credit_payments payment
     SET reversed_at = coalesce(payment.reversed_at, now()),
         reversed_by = coalesce(payment.reversed_by, auth.uid()),
         reversal_reason = coalesce(payment.reversal_reason, trim(_reason))
    FROM public.credit_contracts contract
   WHERE payment.credit_id = contract.id
     AND contract.order_id = target.id
     AND contract.tenant_id = target.tenant_id
     AND payment.reversed_at IS NULL;

  UPDATE public.credit_installments installment
     SET principal_paid = 0, penalty_paid = 0, paid_at = NULL,
         status = 'waived', updated_at = now()
    FROM public.credit_contracts contract
   WHERE installment.credit_id = contract.id
     AND contract.order_id = target.id
     AND contract.tenant_id = target.tenant_id;

  UPDATE public.credit_contracts
     SET status = 'cancelled', closed_at = coalesce(closed_at, now()),
         closed_by = coalesce(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS credit_count = ROW_COUNT;

  FOR payment_row IN
    SELECT tx.*
      FROM public.cash_transactions tx
     WHERE tx.tenant_id = target.tenant_id
       AND tx.direction = 'in'
       AND tx.category IN (
         'sales_payment', 'credit_initial', 'credit_payment', 'receivable_payment'
       )
       AND tx.reversal_of IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.cash_transactions reversal
          WHERE reversal.reversal_of = tx.id
       )
       AND (
         tx.reference_id = target.id
         OR tx.reference = target.order_no
         OR tx.description ILIKE '%' || target.order_no || '%'
         OR tx.reference_id IN (
           SELECT contract.id FROM public.credit_contracts contract
            WHERE contract.order_id = target.id
              AND contract.tenant_id = target.tenant_id
         )
         OR tx.reference_id IN (
           SELECT payment.id
             FROM public.credit_payments payment
             JOIN public.credit_contracts contract ON contract.id = payment.credit_id
            WHERE contract.order_id = target.id
              AND contract.tenant_id = target.tenant_id
         )
       )
     FOR UPDATE
  LOOP
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      counterparty, customer_id, vendor_id, reference_type, reference_id,
      reference, description, occurred_at, created_by, reversal_of
    ) VALUES (
      payment_row.tenant_id, payment_row.account_id, 'out', payment_row.amount,
      payment_row.currency, 'transaction_reversal', payment_row.counterparty,
      payment_row.customer_id, payment_row.vendor_id, 'sales_cancellation', target.id,
      target.order_no,
      'Ləğv: ' || payment_row.transaction_no || ' · ' || trim(_reason),
      now(), coalesce(auth.uid(), payment_row.created_by), payment_row.id
    ) RETURNING id INTO reversal_id;
    reversal_ids := array_append(reversal_ids, reversal_id);
  END LOOP;

  UPDATE public.orders
     SET paid_amount = 0, payment_status = 'unpaid',
         status = 'cancelled', updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'sales',
    'sales_order_reversed', target.order_no || ' satışı tam ləğv edildi',
    jsonb_build_object(
      'order_id', target.id, 'order_no', target.order_no, 'reason', trim(_reason),
      'stock_reversals', stock_reversal_count,
      'released_reservations', released_reservation_count,
      'cancelled_credits', credit_count,
      'cash_reversals', to_jsonb(reversal_ids)
    )
  );

  RETURN jsonb_build_object(
    'order_id', target.id, 'status', 'cancelled',
    'stock_reversals', stock_reversal_count,
    'released_reservations', released_reservation_count,
    'cancelled_credits', credit_count,
    'cash_reversals', to_jsonb(reversal_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sales_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.reverse_sales_order(uuid, text) IS
  'Atomically compensates stock, delivery, credit and cash when a sale is cancelled.';

-- Reconcile residue left by the earlier partial cancellation implementation.
DO $$
DECLARE
  cancelled_order record;
BEGIN
  FOR cancelled_order IN
    SELECT orders.id
      FROM public.orders orders
     WHERE orders.status::text = 'cancelled'
  LOOP
    PERFORM public.reverse_sales_order(
      cancelled_order.id,
      'Əvvəlki natamam satış ləğvinin avtomatik uzlaşdırılması'
    );
  END LOOP;
END;
$$;

