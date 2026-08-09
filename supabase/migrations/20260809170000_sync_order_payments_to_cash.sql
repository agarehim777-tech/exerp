-- Sifarişdə əvvəldən qeydə alınmış, lakin kassaya düşməmiş ödənişləri
-- bir dəfəlik kassa mədaxili kimi sinxronlaşdırır.
INSERT INTO public.cash_accounts (tenant_id, name, type, currency, opening_balance, is_active)
SELECT DISTINCT o.tenant_id, 'Əsas kassa', 'cash'::public.cash_account_type, COALESCE(o.currency, 'AZN'), 0, true
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
  'in'::public.cash_direction,
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
