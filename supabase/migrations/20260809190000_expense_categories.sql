CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
CREATE POLICY "tenant expense categories" ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

INSERT INTO public.expense_categories (tenant_id, name)
SELECT tenant.id, category.name
FROM public.tenants tenant
CROSS JOIN (VALUES ('icarə'), ('kommunal'), ('əmək haqqı'), ('marketinq'), ('nəqliyyat'), ('digər')) AS category(name)
ON CONFLICT (tenant_id, name) DO NOTHING;
