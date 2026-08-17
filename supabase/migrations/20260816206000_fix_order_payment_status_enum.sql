-- PostgreSQL does not implicitly convert a CASE expression from text to the
-- payment_status enum. Keep the payment RPC compatible with enum-backed
-- deployments by casting every branch explicitly.
CREATE OR REPLACE FUNCTION public.register_order_payment(
  _order_id uuid,
  _amount numeric,
  _account_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%rowtype;
  account_row public.cash_accounts%rowtype;
  transaction_id uuid;
  next_paid numeric;
  transaction_number text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.is_tenant_member(o.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _amount IS NULL OR _amount <= 0
     OR COALESCE(o.paid_amount, 0) + _amount > o.total + 0.009 THEN
    RAISE EXCEPTION 'Ödəniş məbləği düzgün deyil';
  END IF;
  SELECT * INTO account_row FROM public.cash_accounts
   WHERE id = _account_id AND tenant_id = o.tenant_id AND is_active = true
   FOR UPDATE;
  IF account_row.id IS NULL THEN RAISE EXCEPTION 'Kassa tapılmadı'; END IF;

  transaction_number := 'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, currency,
    category, customer_id, reference, description, occurred_at, created_by
  ) VALUES (
    o.tenant_id, account_row.id, transaction_number, 'in', round(_amount, 2),
    o.currency, 'sales_payment', o.customer_id, o.order_no,
    o.order_no || ' sifarişi üzrə ödəniş', current_date, auth.uid()
  ) RETURNING id INTO transaction_id;

  next_paid := round(COALESCE(o.paid_amount, 0) + _amount, 2);
  UPDATE public.orders
     SET paid_amount = next_paid,
         payment_status = CASE
           WHEN next_paid >= total THEN 'paid'::public.payment_status
           WHEN next_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'unpaid'::public.payment_status
         END,
         updated_at = now()
   WHERE id = o.id;
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid,numeric,uuid) TO authenticated,service_role;
