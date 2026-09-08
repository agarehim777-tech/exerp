-- Cached clients must not be able to recreate cash after an order was cancelled.
CREATE OR REPLACE FUNCTION public.register_order_payment(
  _order_id uuid,
  _amount numeric,
  _account_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.orders%rowtype;
  account_row public.cash_accounts%rowtype;
  transaction_id uuid;
  next_paid numeric;
  transaction_number text;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL OR NOT public.is_tenant_member(target.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF target.status::text = 'cancelled' THEN
    RAISE EXCEPTION 'Ləğv edilmiş satışa ödəniş qəbul edilə bilməz';
  END IF;
  IF _amount IS NULL OR _amount <= 0
     OR coalesce(target.paid_amount, 0) + _amount > target.total + 0.009 THEN
    RAISE EXCEPTION 'Ödəniş məbləği düzgün deyil';
  END IF;

  SELECT * INTO account_row
    FROM public.cash_accounts
   WHERE id = _account_id
     AND tenant_id = target.tenant_id
     AND is_active = true
   FOR UPDATE;
  IF account_row.id IS NULL THEN RAISE EXCEPTION 'Kassa tapılmadı'; END IF;

  transaction_number := 'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, currency,
    category, customer_id, reference_type, reference_id, reference,
    description, occurred_at, created_by
  ) VALUES (
    target.tenant_id, account_row.id, transaction_number, 'in', round(_amount, 2),
    target.currency, 'sales_payment', target.customer_id, 'sales_order', target.id,
    target.order_no, target.order_no || ' sifarişi üzrə ödəniş', current_date, auth.uid()
  ) RETURNING id INTO transaction_id;

  next_paid := round(coalesce(target.paid_amount, 0) + _amount, 2);
  UPDATE public.orders
     SET paid_amount = next_paid,
         payment_status = CASE
           WHEN next_paid >= total THEN 'paid'::public.payment_status
           WHEN next_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'unpaid'::public.payment_status
         END,
         updated_at = now()
   WHERE id = target.id;
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid, numeric, uuid) TO authenticated;

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
      'Ləğvdən sonra yaranmış ödəniş qalığının avtomatik uzlaşdırılması'
    );
  END LOOP;
END;
$$;

