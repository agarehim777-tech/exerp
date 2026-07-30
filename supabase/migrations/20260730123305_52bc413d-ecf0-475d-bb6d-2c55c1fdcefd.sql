-- 1) Remove the self-elevation bootstrap RPC from the exposed API surface.
REVOKE ALL ON FUNCTION public.platform_bootstrap_admin() FROM PUBLIC, anon, authenticated;

-- 2) Strip blanket PUBLIC/anon EXECUTE from all SECURITY DEFINER routines and
--    re-grant explicitly only where the app needs it (all of these enforce
--    tenant-membership / tenant-admin / platform-admin checks internally).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- Trigger / internal-only routines: no direct caller access at all.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.bump_customer_activity() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_tenant_user_limit() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_doc_number(uuid, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.ensure_rls_helper_grants() FROM authenticated;

-- RLS helper wrappers stay callable by signed-in users (policies depend on them).
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- Application RPCs: signed-in users only, each guarded in-function.
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_match(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_invoice_match(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_project_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_pipeline_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_360(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text, text, integer, text, text[], date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_modules(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid, tenant_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant(uuid, text, integer, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_coa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_crm_pipeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trial_balance(uuid, date, date) TO authenticated;

-- Service role keeps full access (edge functions / bootstrap).
GRANT EXECUTE ON FUNCTION public.platform_bootstrap_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_rls_helper_grants() TO service_role;