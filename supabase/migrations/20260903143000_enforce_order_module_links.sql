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

-- Reconcile historical residues without deleting business documents.
UPDATE public.sales_invoices invoice SET status = 'cancelled', updated_at = now()
FROM public.orders orders
WHERE invoice.order_id = orders.id AND orders.status::text = 'cancelled' AND invoice.status::text <> 'cancelled';

UPDATE public.deliveries delivery SET status = 'cancelled', updated_at = now()
FROM public.orders orders
WHERE delivery.order_id = orders.id AND orders.status::text = 'cancelled' AND delivery.status IN ('pending', 'ready');

