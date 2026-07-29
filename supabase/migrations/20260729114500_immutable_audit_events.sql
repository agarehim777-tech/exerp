CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'Tamamlandı',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

CREATE POLICY "Tenant members can read audit events"
ON public.audit_events
FOR SELECT TO authenticated
USING (private.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY "Tenant members can append their audit events"
ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (
  private.is_tenant_member(tenant_id, auth.uid())
  AND actor_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'audit_events is append-only';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();

CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx
ON public.audit_events(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
ON public.audit_events(tenant_id, module, action);
