-- Core sxemində yaradılmış kassa cədvəllərini tətbiqin istifadə etdiyi
-- genişləndirilmiş maliyyə modeli ilə uyğunlaşdırır.
ALTER TABLE public.cash_accounts
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS account_no text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'AZN',
  ADD COLUMN IF NOT EXISTS counterparty text,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Sifarişdə əvvəldən qeydə alınmış, lakin kassaya düşməmiş ödənişləri
-- bir dəfəlik kassa mədaxili kimi sinxronlaşdırır.
INSERT INTO public.cash_accounts (tenant_id, code, name, type, currency, opening_balance, is_active)
SELECT DISTINCT
  o.tenant_id,
  'MAIN-' || COALESCE(o.currency, 'AZN'),
  'Əsas kassa',
  'cash',
  COALESCE(o.currency, 'AZN'),
  0,
  true
FROM public.orders o
WHERE COALESCE(o.paid_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_accounts ca
    WHERE ca.tenant_id = o.tenant_id
      AND ca.currency = COALESCE(o.currency, 'AZN')
      AND ca.is_active = true
  )
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.cash_transactions (
  tenant_id, account_id, transaction_no, direction, amount, currency, category,
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
  'SYNC-' || o.id::text,
  'in',
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
  )
ON CONFLICT (tenant_id, transaction_no) DO NOTHING;
