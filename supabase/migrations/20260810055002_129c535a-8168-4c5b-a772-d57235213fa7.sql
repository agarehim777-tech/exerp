INSERT INTO public.cash_accounts (tenant_id, name, type, currency, opening_balance, is_active)
SELECT DISTINCT
  o.tenant_id, 'Əsas kassa', 'cash'::cash_account_type, COALESCE(o.currency, 'AZN'), 0, true
FROM public.orders o
WHERE COALESCE(o.paid_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_accounts ca
    WHERE ca.tenant_id = o.tenant_id
      AND ca.currency = COALESCE(o.currency, 'AZN')
      AND ca.is_active = true
  );

INSERT INTO public.cash_transactions (
  tenant_id, account_id, direction, amount, currency, category,
  counterparty, customer_id, reference, description, occurred_at, created_by
)
SELECT
  o.tenant_id,
  (
    SELECT ca.id FROM public.cash_accounts ca
    WHERE ca.tenant_id = o.tenant_id
      AND ca.currency = COALESCE(o.currency, 'AZN')
      AND ca.is_active = true
    ORDER BY CASE WHEN ca.type = 'cash' THEN 0 ELSE 1 END, ca.created_at
    LIMIT 1
  ),
  'in'::cash_direction,
  o.paid_amount,
  COALESCE(o.currency, 'AZN'),
  'sales_payment',
  c.name,
  o.customer_id,
  o.order_no,
  o.order_no || ' sifarişi üzrə əvvəlki ödənişin kassa sinxronizasiyası',
  COALESCE(o.order_date, o.created_at::date, current_date),
  o.created_by
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE COALESCE(o.paid_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_transactions ct
    WHERE ct.tenant_id = o.tenant_id
      AND ct.direction = 'in'
      AND ct.reference = o.order_no
      AND ct.category = 'sales_payment'
  );

WITH ranked AS (
  SELECT id, tenant_id, currency,
         first_value(id) OVER (PARTITION BY tenant_id, currency ORDER BY created_at, id) AS keeper_id,
         row_number() OVER (PARTITION BY tenant_id, currency ORDER BY created_at, id) AS row_no
  FROM public.cash_accounts
  WHERE is_active = true AND lower(btrim(name)) = lower('Əsas kassa')
)
UPDATE public.cash_transactions ct
SET account_id = ranked.keeper_id
FROM ranked
WHERE ranked.row_no > 1 AND ct.account_id = ranked.id;

WITH ranked AS (
  SELECT id, tenant_id, currency,
         row_number() OVER (PARTITION BY tenant_id, currency ORDER BY created_at, id) AS row_no
  FROM public.cash_accounts
  WHERE is_active = true AND lower(btrim(name)) = lower('Əsas kassa')
)
UPDATE public.cash_accounts ca
SET is_active = false
FROM ranked
WHERE ranked.row_no > 1 AND ca.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_single_main_idx
ON public.cash_accounts (tenant_id, currency)
WHERE is_active = true AND lower(btrim(name)) = lower('Əsas kassa');

DO $$
DECLARE
  tenant_row RECORD;
  item RECORD;
  next_no INTEGER;
  new_no TEXT;
BEGIN
  FOR tenant_row IN SELECT id FROM public.tenants LOOP
    SELECT GREATEST(1000, COALESCE(MAX((regexp_match(order_no, '^SF-([0-9]+)$'))[1]::INTEGER), 1000))
      INTO next_no FROM public.orders WHERE tenant_id = tenant_row.id;
    FOR item IN SELECT id, order_no FROM public.orders
      WHERE tenant_id = tenant_row.id AND order_no !~ '^SF-[0-9]+$'
      ORDER BY created_at, id
    LOOP
      next_no := next_no + 1;
      new_no := 'SF-' || next_no;
      UPDATE public.cash_transactions SET reference = new_no
        WHERE tenant_id = tenant_row.id AND reference = item.order_no;
      UPDATE public.orders SET order_no = new_no WHERE id = item.id;
    END LOOP;

    SELECT GREATEST(1000, COALESCE(MAX((regexp_match(contract_no, '^İN-([0-9]+)$'))[1]::INTEGER), 1000))
      INTO next_no FROM public.credit_contracts WHERE tenant_id = tenant_row.id;
    FOR item IN SELECT id, contract_no FROM public.credit_contracts
      WHERE tenant_id = tenant_row.id AND contract_no !~ '^İN-[0-9]+$'
      ORDER BY created_at, id
    LOOP
      next_no := next_no + 1;
      UPDATE public.credit_contracts SET contract_no = 'İN-' || next_no WHERE id = item.id;
    END LOOP;
  END LOOP;
END $$;