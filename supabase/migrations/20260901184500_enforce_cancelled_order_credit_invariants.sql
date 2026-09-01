-- Cancelled orders never carry an active credit balance. This also protects
-- against older clients replaying cached payment totals after cancellation.
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

