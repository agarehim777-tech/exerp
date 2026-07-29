CREATE TABLE IF NOT EXISTS public.tenant_state_snapshots (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.tenant_state_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.tenant_state_snapshots TO authenticated;
GRANT ALL ON public.tenant_state_snapshots TO service_role;

CREATE POLICY "Tenant members can read ERP snapshot"
ON public.tenant_state_snapshots
FOR SELECT TO authenticated
USING (private.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY "Tenant editors can create ERP snapshot"
ON public.tenant_state_snapshots
FOR INSERT TO authenticated
WITH CHECK (
  private.is_tenant_member(tenant_id, auth.uid())
  AND private.has_module_access(tenant_id, 'settings', 'edit')
);

CREATE POLICY "Tenant editors can update ERP snapshot"
ON public.tenant_state_snapshots
FOR UPDATE TO authenticated
USING (
  private.is_tenant_member(tenant_id, auth.uid())
  AND private.has_module_access(tenant_id, 'settings', 'edit')
)
WITH CHECK (
  private.is_tenant_member(tenant_id, auth.uid())
  AND private.has_module_access(tenant_id, 'settings', 'edit')
);

CREATE INDEX IF NOT EXISTS tenant_state_snapshots_updated_at_idx
ON public.tenant_state_snapshots(updated_at DESC);
