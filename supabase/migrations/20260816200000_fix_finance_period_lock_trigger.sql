-- A polymorphic trigger cannot reference columns that do not exist on every
-- attached table. Read the date and tenant through jsonb instead.
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
