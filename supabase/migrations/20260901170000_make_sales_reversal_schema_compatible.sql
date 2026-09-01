-- Some long-lived projects predate order_accounting_events. Resolve delivery
-- state from the order first and consult that table only when it exists.
CREATE OR REPLACE FUNCTION public.reverse_sales_order(
  _order_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  payment_row public.cash_transactions%rowtype;
  reversal_ids uuid[] := ARRAY[]::uuid[];
  reversal_id uuid;
  delivered boolean := false;
  accounting_delivery boolean := false;
BEGIN
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sifariş tapılmadı'; END IF;
  IF NOT private.has_module_access(target.tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'Bu satışın ləğvi üçün icazəniz yoxdur';
  END IF;
  IF target.status::text = 'cancelled' THEN
    RETURN jsonb_build_object('order_id', target.id, 'status', 'cancelled', 'idempotent', true);
  END IF;

  delivered := lower(target.status::text) IN ('delivered', 'completed', 'təhvil verilib');
  IF to_regclass('public.order_accounting_events') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1 FROM public.order_accounting_events
      WHERE order_id = $1 AND event_type = ''delivery''
    )' INTO accounting_delivery USING target.id;
    delivered := delivered OR accounting_delivery;
  END IF;

  IF delivered THEN
    PERFORM public.process_sales_order_status(target.id, 'cancelled');
  ELSE
    FOR reservation_row IN
      SELECT * FROM public.stock_reservations
      WHERE order_id = target.id AND status = 'active'
      FOR UPDATE
    LOOP
      UPDATE public.stock_balances
         SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity),
             updated_at = now()
       WHERE tenant_id = reservation_row.tenant_id
         AND warehouse_id = reservation_row.warehouse_id
         AND product_id = reservation_row.product_id;
    END LOOP;
    UPDATE public.stock_reservations
       SET status = 'released', updated_at = now()
     WHERE order_id = target.id AND status = 'active';
  END IF;

  UPDATE public.sales_bonus_entries
     SET status = 'reversed', reversed_at = COALESCE(reversed_at, now())
   WHERE order_id = target.id AND status <> 'reversed';

  UPDATE public.credit_payments payment
     SET reversed_at = COALESCE(payment.reversed_at, now()),
         reversed_by = COALESCE(payment.reversed_by, auth.uid()),
         reversal_reason = COALESCE(payment.reversal_reason, trim(_reason))
    FROM public.credit_contracts contract
   WHERE payment.credit_id = contract.id
     AND contract.order_id = target.id
     AND payment.reversed_at IS NULL;

  UPDATE public.credit_installments installment
     SET principal_paid = 0, penalty_paid = 0, paid_at = NULL,
         status = 'waived', updated_at = now()
    FROM public.credit_contracts contract
   WHERE installment.credit_id = contract.id
     AND contract.order_id = target.id;

  UPDATE public.credit_contracts
     SET status = 'closed', closed_at = COALESCE(closed_at, now()),
         closed_by = COALESCE(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = target.id AND status <> 'closed';

  FOR payment_row IN
    SELECT tx.* FROM public.cash_transactions tx
     WHERE tx.tenant_id = target.tenant_id
       AND tx.direction = 'in'
       AND tx.category IN ('sales_payment', 'credit_payment', 'receivable_payment')
       AND (tx.reference = target.order_no OR tx.description ILIKE '%' || target.order_no || '%')
       AND tx.reversal_of IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of = tx.id)
     FOR UPDATE
  LOOP
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      counterparty, customer_id, vendor_id, reference, description,
      occurred_at, created_by, reversal_of
    ) VALUES (
      payment_row.tenant_id, payment_row.account_id,
      CASE payment_row.direction::text WHEN 'in' THEN 'out' ELSE 'in' END,
      payment_row.amount, payment_row.currency, 'transaction_reversal',
      payment_row.counterparty, payment_row.customer_id, payment_row.vendor_id,
      payment_row.reference,
      'Ləğv: ' || payment_row.transaction_no || ' · ' || trim(_reason),
      current_date, auth.uid(), payment_row.id
    ) RETURNING id INTO reversal_id;
    reversal_ids := array_append(reversal_ids, reversal_id);
  END LOOP;

  UPDATE public.orders
     SET paid_amount = 0, payment_status = 'unpaid', status = 'cancelled', updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'sales', 'sales_order_reversed',
    target.order_no || ' satışı vahid əməliyyatla ləğv edildi',
    jsonb_build_object('order_id', target.id, 'order_no', target.order_no, 'reason', trim(_reason),
      'was_delivered', delivered, 'cash_reversals', to_jsonb(reversal_ids))
  );

  RETURN jsonb_build_object('order_id', target.id, 'status', 'cancelled',
    'stock_reversed', delivered, 'cash_reversals', to_jsonb(reversal_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sales_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order(uuid, text) TO authenticated, service_role;
