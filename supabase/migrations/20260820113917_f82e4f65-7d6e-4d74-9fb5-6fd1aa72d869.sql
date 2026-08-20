CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('app.tenant_purge', 'on', true);

  DELETE FROM public.journal_lines jl
   USING public.journal_entries je
   WHERE jl.entry_id = je.id AND je.tenant_id = _tenant;
  DELETE FROM public.journal_entries WHERE tenant_id = _tenant;

  DELETE FROM public.tenants WHERE id = _tenant;
  PERFORM set_config('app.tenant_purge', 'off', true);
END;
$fn$;