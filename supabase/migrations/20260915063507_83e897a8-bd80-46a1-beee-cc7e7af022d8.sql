-- Cancelled orders never carry an active credit balance.
CREATE OR REPLACE FUNCTION public.sync_credit_payment_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_order public.orders%rowtype;
  sales_cash numeric := 0;
  credit_principal numeric := 0;
  next_paid numeric := 0;
  target_credit_id uuid;
BEGIN
  target_credit_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.credit_id ELSE NEW.credit_id END;
  SELECT o.* INTO linked_order
    FROM public.credit_contracts cc
    JOIN public.orders o ON o.id = cc.order_id AND o.tenant_id = cc.tenant_id
   WHERE cc.id = target_credit_id
   LIMIT 1;
  IF linked_order.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF linked_order.status::text = 'cancelled' THEN
    UPDATE public.orders
       SET paid_amount = 0, payment_status = 'unpaid', updated_at = now()
     WHERE id = linked_order.id
       AND (paid_amount <> 0 OR payment_status::text <> 'unpaid');
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(ct.amount), 0) INTO sales_cash
    FROM public.cash_transactions ct
   WHERE ct.tenant_id = linked_order.tenant_id
     AND ct.direction = 'in'
     AND ct.category = 'sales_payment'
     AND ct.reference = linked_order.order_no
     AND NOT EXISTS (
       SELECT 1 FROM public.cash_transactions reversal
       WHERE reversal.reversal_of = ct.id
     );

  SELECT COALESCE(sum(cp.principal_amount), 0) INTO credit_principal
    FROM public.credit_payments cp
    JOIN public.credit_contracts cc ON cc.id = cp.credit_id AND cc.tenant_id = cp.tenant_id
   WHERE cc.order_id = linked_order.id
     AND cc.tenant_id = linked_order.tenant_id
     AND cp.reversed_at IS NULL;

  next_paid := LEAST(linked_order.total, round(sales_cash + credit_principal, 2));
  UPDATE public.orders
     SET paid_amount = next_paid,
         payment_status = CASE
           WHEN next_paid >= total THEN 'paid'::public.payment_status
           WHEN next_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'unpaid'::public.payment_status
         END,
         updated_at = now()
   WHERE id = linked_order.id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_credit_for_cancelled_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = NEW.order_id AND o.status::text = 'cancelled'
  ) THEN
    NEW.status := 'closed';
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_credit_for_cancelled_order ON public.credit_contracts;
CREATE TRIGGER trg_close_credit_for_cancelled_order
BEFORE INSERT OR UPDATE OF order_id, status ON public.credit_contracts
FOR EACH ROW EXECUTE FUNCTION public.close_credit_for_cancelled_order();

UPDATE public.credit_contracts contract
   SET status = 'closed', closed_at = COALESCE(contract.closed_at, now()), updated_at = now()
  FROM public.orders orders
 WHERE orders.id = contract.order_id
   AND orders.status::text = 'cancelled'
   AND contract.status <> 'closed';

UPDATE public.credit_payments payment
   SET reversed_at = COALESCE(payment.reversed_at, now()),
       reversal_reason = COALESCE(payment.reversal_reason, 'Bağlı satış ləğv edilib')
  FROM public.credit_contracts contract
  JOIN public.orders orders ON orders.id = contract.order_id
 WHERE payment.credit_id = contract.id
   AND orders.status::text = 'cancelled'
   AND payment.reversed_at IS NULL;

UPDATE public.credit_installments installment
   SET principal_paid = 0, penalty_paid = 0, paid_at = NULL,
       status = 'waived', updated_at = now()
  FROM public.credit_contracts contract
  JOIN public.orders orders ON orders.id = contract.order_id
 WHERE installment.credit_id = contract.id
   AND orders.status::text = 'cancelled'
   AND installment.status <> 'waived';

UPDATE public.orders
   SET paid_amount = 0, payment_status = 'unpaid', updated_at = now()
 WHERE status::text = 'cancelled'
   AND (paid_amount <> 0 OR payment_status::text <> 'unpaid');

REVOKE ALL ON FUNCTION public.close_credit_for_cancelled_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_credit_for_cancelled_order() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_sales_order_reversal(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target public.orders%rowtype;
  credit_count integer := 0;
  reservation_count integer := 0;
  stock_return_count integer := 0;
  payment_amount numeric := 0;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sifariş tapılmadı'; END IF;
  IF NOT private.has_module_access(target.tenant_id, 'sales', 'view') THEN
    RAISE EXCEPTION 'Bu satışa baxmaq icazəniz yoxdur';
  END IF;

  SELECT count(*) INTO credit_count FROM public.credit_contracts WHERE order_id = target.id;
  SELECT count(*) INTO reservation_count FROM public.stock_reservations WHERE order_id = target.id AND status = 'active';
  SELECT count(*) INTO stock_return_count FROM public.order_items WHERE order_id = target.id;
  SELECT coalesce(sum(CASE WHEN direction::text IN ('in','Mədaxil') THEN amount ELSE -amount END), 0)
    INTO payment_amount
    FROM public.cash_transactions tx
   WHERE tx.tenant_id = target.tenant_id
     AND tx.reversal_of IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of = tx.id)
     AND (tx.reference_id = target.id OR tx.reference = target.order_no);

  RETURN jsonb_build_object(
    'order_id', target.id,
    'order_no', target.order_no,
    'status', target.status,
    'credit_count', credit_count,
    'payment_amount', greatest(payment_amount, 0),
    'reservation_count', reservation_count,
    'stock_return_count', CASE WHEN target.status::text = 'delivered' THEN stock_return_count ELSE 0 END,
    'will_close_credit', credit_count > 0,
    'will_reverse_cash', payment_amount > 0,
    'will_restore_stock', target.status::text = 'delivered'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_sales_order_reversal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_sales_order_reversal(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_cancelled_order_module_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reservation_row public.stock_reservations%rowtype;
BEGIN
  IF NEW.status::text <> 'cancelled' OR OLD.status::text = 'cancelled' THEN
    RETURN NEW;
  END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations
     WHERE order_id = NEW.id AND status = 'active'
     FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity), updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
  END LOOP;

  UPDATE public.stock_reservations SET status = 'released', updated_at = now()
   WHERE order_id = NEW.id AND status = 'active';
  UPDATE public.credit_contracts
     SET status = 'closed', closed_at = COALESCE(closed_at, now()), closed_by = COALESCE(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = NEW.id AND status <> 'closed';
  UPDATE public.credit_payments payment
     SET reversed_at = COALESCE(payment.reversed_at, now()), reversal_reason = COALESCE(payment.reversal_reason, 'Bağlı satış ləğv edilib')
    FROM public.credit_contracts contract
   WHERE payment.credit_id = contract.id AND contract.order_id = NEW.id AND payment.reversed_at IS NULL;
  UPDATE public.credit_installments installment
     SET principal_paid = 0, penalty_paid = 0, paid_at = NULL, status = 'waived', updated_at = now()
    FROM public.credit_contracts contract
   WHERE installment.credit_id = contract.id AND contract.order_id = NEW.id AND installment.status <> 'waived';
  UPDATE public.sales_invoices SET status = 'cancelled', updated_at = now()
   WHERE order_id = NEW.id AND status::text <> 'cancelled';
  UPDATE public.deliveries SET status = 'cancelled', updated_at = now()
   WHERE order_id = NEW.id AND status IN ('pending', 'ready');

  NEW.paid_amount := 0;
  NEW.payment_status := 'unpaid'::public.payment_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cancelled_order_module_links ON public.orders;
CREATE TRIGGER trg_enforce_cancelled_order_module_links
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_cancelled_order_module_links();

REVOKE ALL ON FUNCTION public.enforce_cancelled_order_module_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_cancelled_order_module_links() TO authenticated, service_role;

UPDATE public.sales_invoices invoice SET status = 'cancelled', updated_at = now()
FROM public.orders orders
WHERE invoice.order_id = orders.id AND orders.status::text = 'cancelled' AND invoice.status::text <> 'cancelled';

UPDATE public.deliveries delivery SET status = 'cancelled', updated_at = now()
FROM public.orders orders
WHERE delivery.order_id = orders.id AND orders.status::text = 'cancelled' AND delivery.status IN ('pending', 'ready');