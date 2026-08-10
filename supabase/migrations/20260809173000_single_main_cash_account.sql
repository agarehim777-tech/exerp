-- Hər şirkət və valyuta üçün yalnız bir aktiv “Əsas kassa” saxla.
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
