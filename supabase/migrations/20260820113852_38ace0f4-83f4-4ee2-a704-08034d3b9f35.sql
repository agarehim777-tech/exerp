CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.role() = 'service_role'
     OR current_setting('app.tenant_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_events is append-only';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('app.tenant_purge', 'on', true);
  DELETE FROM public.tenants WHERE id = _tenant;
  PERFORM set_config('app.tenant_purge', 'off', true);
END;
$fn$;