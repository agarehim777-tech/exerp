UPDATE public.customers SET segment = 'individual' WHERE segment = 'vip';
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_segment_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_segment_check CHECK (segment IN ('individual','business'));
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_level_override text CHECK (customer_level_override IN ('standard','silver','gold','platinum'));

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
CREATE POLICY customer_level_settings_member_all ON public.customer_level_settings FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
