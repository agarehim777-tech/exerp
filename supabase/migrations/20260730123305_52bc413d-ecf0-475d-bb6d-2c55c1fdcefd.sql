-- 1) Remove the self-elevation bootstrap RPC from the exposed API surface.
-- Some installations predate optional ERP modules, so permissions are applied
-- only when the corresponding routine exists.

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

DO $$
DECLARE
  signature TEXT;
  routine REGPROCEDURE;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.platform_bootstrap_admin()', 'public.handle_new_user()',
    'public.bump_customer_activity()', 'public.enforce_tenant_user_limit()',
    'public.generate_doc_number(uuid,text,text,text)', 'public.ensure_rls_helper_grants()'
  ] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', routine);
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.is_tenant_member(uuid,uuid)', 'public.is_tenant_admin(uuid,uuid)',
    'public.is_platform_admin(uuid)', 'public.accept_tenant_invite(text)',
    'public.apply_invoice_match(uuid,numeric,numeric)', 'public.evaluate_invoice_match(uuid,numeric,numeric)',
    'public.check_my_access()', 'public.check_project_access(uuid)',
    'public.convert_quote_to_order(uuid)', 'public.create_tenant(text,text)',
    'public.crm_pipeline_summary(uuid)', 'public.customer_360(uuid)',
    'public.platform_create_tenant(text,text,integer,text,text[],date,text,text)',
    'public.platform_delete_tenant(uuid)', 'public.platform_health_check()',
    'public.platform_list_tenants()', 'public.platform_set_tenant_modules(uuid,text[])',
    'public.platform_set_tenant_status(uuid,tenant_status)',
    'public.platform_update_tenant(uuid,text,integer,text,date,text)',
    'public.sales_dashboard(uuid,date,date)', 'public.seed_default_coa(uuid)',
    'public.seed_default_crm_pipeline(uuid)', 'public.trial_balance(uuid,date,date)'
  ] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', routine);
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.platform_bootstrap_admin()', 'public.ensure_rls_helper_grants()'
  ] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', routine);
    END IF;
  END LOOP;
END $$;

