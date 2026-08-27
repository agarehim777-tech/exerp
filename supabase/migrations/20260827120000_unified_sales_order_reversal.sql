-- One auditable transaction boundary for cancelling a sale. The order remains
-- in the ledger; stock, COGS, cash, credit and reservations are compensated.
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
  delivered boolean;
BEGIN
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sifariş tapılmadı'; END IF;
  IF NOT private.has_module_access(target.tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'Bu satışın ləğvi üçün icazəniz yoxdur';
  END IF;
  IF target.status = 'cancelled' THEN
    RETURN jsonb_build_object('order_id', target.id, 'status', 'cancelled', 'idempotent', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.credit_payments p
    JOIN public.credit_contracts c ON c.id = p.credit_id
    WHERE c.order_id = target.id
  ) THEN
    RAISE EXCEPTION 'Kredit ödənişi olan satış əvvəlcə kredit modulunda bağlanmalı və ya restrukturizasiya edilməlidir';
  END IF;

  delivered := EXISTS (
    SELECT 1 FROM public.order_accounting_events
    WHERE order_id = target.id AND event_type = 'delivery'
  );

  IF delivered THEN
    -- Restores historical cost layers/stock and posts the exact opposite COGS,
    -- revenue, VAT and receivable journal entry.
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
    UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = target.id;
  END IF;

  UPDATE public.sales_bonus_entries
     SET status = 'reversed', reversed_at = COALESCE(reversed_at, now())
   WHERE order_id = target.id AND status <> 'reversed';

  UPDATE public.credit_contracts
     SET status = 'closed', closed_at = COALESCE(closed_at, now()),
         closed_by = COALESCE(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = target.id AND status <> 'closed';

  FOR payment_row IN
    SELECT tx.* FROM public.cash_transactions tx
     WHERE tx.tenant_id = target.tenant_id
       AND tx.direction = 'in'
       AND tx.category IN ('sales_payment', 'credit_payment')
       AND (tx.reference = target.order_no OR tx.description ILIKE '%' || target.order_no || '%')
       AND tx.reversal_of IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of = tx.id)
     FOR UPDATE
  LOOP
    reversal_id := public.reverse_cash_transaction(target.tenant_id, payment_row.id, _reason);
    reversal_ids := array_append(reversal_ids, reversal_id);
  END LOOP;

  UPDATE public.orders
     SET paid_amount = 0, payment_status = 'unpaid', status = 'cancelled', updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'sales', 'sales_order_reversed',
    target.order_no || ' satışı vahid əməliyyatla ləğv edildi',
    jsonb_build_object(
      'order_id', target.id,
      'order_no', target.order_no,
      'reason', trim(_reason),
      'was_delivered', delivered,
      'cash_reversals', to_jsonb(reversal_ids)
    )
  );

  RETURN jsonb_build_object(
    'order_id', target.id,
    'status', 'cancelled',
    'stock_reversed', delivered,
    'cash_reversals', to_jsonb(reversal_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sales_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.reverse_sales_order(uuid, text) IS
  'Atomic, idempotent and auditable sales cancellation across inventory, accounting, cash, credit and bonus ledgers.';
