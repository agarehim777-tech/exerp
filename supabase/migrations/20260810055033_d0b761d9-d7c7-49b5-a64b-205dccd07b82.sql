ALTER TABLE public.expenses ALTER COLUMN status SET DEFAULT 'pending';

UPDATE public.expenses e
SET status = 'pending'
WHERE e.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_transactions ct
    WHERE ct.tenant_id = e.tenant_id
      AND ct.reference = 'EXPENSE:' || e.id::text
      AND ct.direction = 'out'
  );

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant expense categories" ON public.expense_categories;
CREATE POLICY "tenant expense categories" ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

INSERT INTO public.expense_categories (tenant_id, name)
SELECT tenant.id, category.name
FROM public.tenants tenant
CROSS JOIN (VALUES ('icarə'), ('kommunal'), ('əmək haqqı'), ('marketinq'), ('nəqliyyat'), ('digər')) AS category(name)
ON CONFLICT (tenant_id, name) DO NOTHING;

UPDATE public.customers SET segment = 'individual' WHERE segment = 'vip';
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_segment_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_segment_check CHECK (segment IN ('individual','business'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_level_override text CHECK (customer_level_override IN ('standard','silver','gold','platinum'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date date;
COMMENT ON COLUMN public.customers.birth_date IS 'Optional customer birth date used for birthday reminders and congratulations.';

CREATE TABLE IF NOT EXISTS public.customer_level_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  silver_min numeric(14,2) NOT NULL DEFAULT 1000 CHECK (silver_min >= 0),
  gold_min numeric(14,2) NOT NULL DEFAULT 5000 CHECK (gold_min >= silver_min),
  platinum_min numeric(14,2) NOT NULL DEFAULT 15000 CHECK (platinum_min >= gold_min),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_level_settings TO authenticated;
GRANT ALL ON public.customer_level_settings TO service_role;
ALTER TABLE public.customer_level_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_level_settings_member_all ON public.customer_level_settings;
CREATE POLICY customer_level_settings_member_all ON public.customer_level_settings FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));