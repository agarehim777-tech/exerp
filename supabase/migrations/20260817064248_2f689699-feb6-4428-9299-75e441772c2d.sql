CREATE OR REPLACE FUNCTION private.enforce_finance_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  row_data jsonb;
  business_date date;
  row_tenant uuid;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_tenant := NULLIF(row_data->>'tenant_id', '')::uuid;
  business_date := CASE TG_TABLE_NAME
    WHEN 'expenses' THEN COALESCE(NULLIF(row_data->>'expense_date', '')::date, current_date)
    WHEN 'cash_transactions' THEN COALESCE(NULLIF(row_data->>'occurred_at', '')::timestamptz::date, current_date)
    WHEN 'credit_payments' THEN COALESCE(NULLIF(row_data->>'paid_at', '')::timestamptz::date, current_date)
    ELSE current_date
  END;
  PERFORM private.assert_open_accounting_period(row_tenant, business_date);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

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
         payment_status = CASE WHEN next_paid >= total THEN 'paid' ELSE 'partial' END,
         updated_at = now()
   WHERE id = o.id;
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid,numeric,uuid) TO authenticated,service_role;

ALTER TABLE public.cash_transactions
  ALTER COLUMN transaction_no SET DEFAULT (
    'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );