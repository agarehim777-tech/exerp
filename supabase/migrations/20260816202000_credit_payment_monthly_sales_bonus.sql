-- Link credit cash receipts to their sales order before the generic cash
-- bonus trigger runs. The payment date remains the bonus accrual date.
CREATE OR REPLACE FUNCTION public.link_credit_cash_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_order public.orders%rowtype;
  payment_date date;
BEGIN
  IF NEW.direction <> 'in' OR NEW.category <> 'credit_payment' OR NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.*
    INTO linked_order
    FROM public.credit_payments cp
    JOIN public.credit_contracts cc ON cc.id = cp.credit_id AND cc.tenant_id = cp.tenant_id
    JOIN public.orders o ON o.id = cc.order_id AND o.tenant_id = cc.tenant_id
   WHERE cp.id = NEW.reference_id
     AND cp.tenant_id = NEW.tenant_id
   LIMIT 1;

  IF linked_order.id IS NOT NULL THEN
    SELECT cp.paid_at::date INTO payment_date
      FROM public.credit_payments cp
     WHERE cp.id = NEW.reference_id AND cp.tenant_id = NEW.tenant_id;
    NEW.reference := linked_order.order_no;
    NEW.customer_id := linked_order.customer_id;
    NEW.currency := COALESCE(NULLIF(NEW.currency, ''), linked_order.currency, 'AZN');
    NEW.occurred_at := COALESCE(NEW.occurred_at, payment_date::timestamptz, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_credit_cash_transaction ON public.cash_transactions;
CREATE TRIGGER trg_link_credit_cash_transaction
BEFORE INSERT OR UPDATE OF reference_id, category, direction
ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.link_credit_cash_transaction();

CREATE OR REPLACE FUNCTION public.accrue_sales_bonus_for_cash_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_order public.orders%rowtype;
  assignment record;
  accrual_date date := COALESCE(NEW.occurred_at::date, current_date);
BEGIN
  IF NEW.direction <> 'in'
     OR NEW.category NOT IN ('sales_payment', 'credit_payment', 'receivable_payment') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO linked_order
    FROM public.orders
   WHERE tenant_id = NEW.tenant_id AND order_no = NEW.reference
   ORDER BY created_at DESC
   LIMIT 1;

  IF linked_order.id IS NULL AND NEW.category = 'credit_payment' AND NEW.reference_id IS NOT NULL THEN
    SELECT o.* INTO linked_order
      FROM public.credit_payments cp
      JOIN public.credit_contracts cc ON cc.id = cp.credit_id AND cc.tenant_id = cp.tenant_id
      JOIN public.orders o ON o.id = cc.order_id AND o.tenant_id = cc.tenant_id
     WHERE cp.id = NEW.reference_id AND cp.tenant_id = NEW.tenant_id
     LIMIT 1;
  END IF;

  IF linked_order.id IS NULL THEN RETURN NEW; END IF;

  FOR assignment IN
    SELECT * FROM public.order_bonus_assignments
     WHERE tenant_id = NEW.tenant_id
       AND order_id = linked_order.id
       AND effective_from <= accrual_date
       AND (effective_to IS NULL OR effective_to >= accrual_date)
  LOOP
    INSERT INTO public.sales_bonus_entries(
      tenant_id, order_id, assignment_id, cash_transaction_id,
      seller_name, rate, payment_amount, bonus_amount, accrued_on, created_by
    ) VALUES (
      NEW.tenant_id, linked_order.id, assignment.id, NEW.id,
      assignment.seller_name, assignment.rate, NEW.amount,
      round(NEW.amount * assignment.rate / 100, 2), accrual_date, auth.uid()
    )
    ON CONFLICT (cash_transaction_id, assignment_id) DO UPDATE SET
      payment_amount = EXCLUDED.payment_amount,
      bonus_amount = EXCLUDED.bonus_amount,
      accrued_on = EXCLUDED.accrued_on;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Keep the sales order's paid/debt figures aligned with initial-payment cash
-- plus principal received through the credit schedule.
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

  SELECT COALESCE(sum(ct.amount), 0) INTO sales_cash
    FROM public.cash_transactions ct
   WHERE ct.tenant_id = linked_order.tenant_id
     AND ct.direction = 'in'
     AND ct.category = 'sales_payment'
     AND ct.reference = linked_order.order_no;

  SELECT COALESCE(sum(cp.principal_amount), 0) INTO credit_principal
    FROM public.credit_payments cp
    JOIN public.credit_contracts cc ON cc.id = cp.credit_id AND cc.tenant_id = cp.tenant_id
   WHERE cc.order_id = linked_order.id AND cc.tenant_id = linked_order.tenant_id;

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

DROP TRIGGER IF EXISTS trg_sync_credit_payment_to_order ON public.credit_payments;
CREATE TRIGGER trg_sync_credit_payment_to_order
AFTER INSERT OR UPDATE OR DELETE ON public.credit_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_credit_payment_to_order();

-- Repair earlier credit cash rows that had reference_id but no order number.
UPDATE public.cash_transactions ct
   SET reference = o.order_no,
       customer_id = o.customer_id,
       currency = COALESCE(NULLIF(ct.currency, ''), o.currency, 'AZN'),
       occurred_at = COALESCE(ct.occurred_at, cp.paid_at)
  FROM public.credit_payments cp
  JOIN public.credit_contracts cc ON cc.id = cp.credit_id AND cc.tenant_id = cp.tenant_id
  JOIN public.orders o ON o.id = cc.order_id AND o.tenant_id = cc.tenant_id
 WHERE ct.tenant_id = cp.tenant_id
   AND ct.category = 'credit_payment'
   AND ct.reference_id = cp.id
   AND (ct.reference IS DISTINCT FROM o.order_no OR ct.customer_id IS DISTINCT FROM o.customer_id);

REVOKE ALL ON FUNCTION public.link_credit_cash_transaction(), public.sync_credit_payment_to_order() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_credit_cash_transaction(), public.sync_credit_payment_to_order() TO authenticated, service_role;
