-- A credit linked to a cancelled sale is 'cancelled', not 'closed'.
--
-- reverse_sales_order (20261001134507) sets the linked credit to 'cancelled' and then cancels the
-- order. Two older triggers from September still rewrote it to 'closed':
--   * enforce_cancelled_order_module_links (BEFORE UPDATE on orders) closed every linked credit;
--   * close_credit_for_cancelled_order (BEFORE INSERT/UPDATE on credit_contracts) forced 'closed'.
-- 'closed' means "fully repaid". Receivable settlement (20261014075609) and the reversal command
-- treat a credit on a cancelled sale as 'cancelled', so the old value broke them.
-- Guards and integrity scans accept both values and need no change.

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
    NEW.status := 'cancelled';
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

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
     SET status = 'cancelled', closed_at = COALESCE(closed_at, now()), closed_by = COALESCE(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = NEW.id AND status <> 'cancelled';
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

-- Credits the old triggers marked 'closed' although their sale was cancelled.
UPDATE public.credit_contracts contract
   SET status = 'cancelled', updated_at = now()
  FROM public.orders o
 WHERE o.id = contract.order_id
   AND o.status::text = 'cancelled'
   AND contract.status::text = 'closed';
