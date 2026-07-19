
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, module)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Seed default permissions
WITH modules(name) AS (VALUES
  ('dashboard'),('platform'),('crm'),('sales'),('warehouse'),('deliveries'),
  ('finance'),('invoices'),('accounting'),('tax'),('credits'),('receivables'),
  ('vendors'),('procurement'),('projects'),('production'),('hr'),('kpi'),
  ('contracts'),('reports'),('support'),('help'),('onboarding'),
  ('messages'),('notifications'),('api'),('settings')
)
INSERT INTO public.role_permissions(role, module, can_view, can_edit)
SELECT r::app_role, m.name,
  true,
  CASE
    WHEN r IN ('owner','admin') THEN true
    WHEN r = 'member' AND m.name IN ('crm','sales','warehouse','deliveries','vendors','procurement','projects','production','hr','contracts','messages','notifications') THEN true
    ELSE false
  END
FROM (VALUES ('owner'),('admin'),('member'),('viewer')) AS roles(r)
CROSS JOIN modules m
ON CONFLICT (role, module) DO NOTHING;

-- Restrict sensitive modules for member (settings/api/platform/accounting/tax) already false
-- For viewer: everything view-only
CREATE OR REPLACE FUNCTION public.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.role_permissions rp ON rp.role = tm.role AND rp.module = _module
    WHERE tm.tenant_id = _tenant
      AND tm.user_id = auth.uid()
      AND (
        (_action = 'view' AND rp.can_view) OR
        (_action = 'edit' AND rp.can_edit)
      )
  );
$$;
