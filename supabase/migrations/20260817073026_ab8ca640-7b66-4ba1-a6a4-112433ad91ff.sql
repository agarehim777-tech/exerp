DO $$
DECLARE r record;
BEGIN
  -- 1) Trigger funksiyaları heç kim birbaşa çağıra bilməz
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;

  -- 2) Anonim rol heç bir public funksiyanı çağıra bilməz
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;

  -- 3) Yalnız server/daxili istifadə üçün funksiyalar
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN (
        'ensure_inventory_accounts','seed_default_coa','seed_default_crm_pipeline',
        'post_invoice_to_gl','post_payment_to_gl','prune_operational_logs',
        'ensure_rls_helper_grants','platform_bootstrap_admin','platform_health_check',
        'generate_doc_number','gl_account_by_code','apply_invoice_match'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Gələcəkdə yaradılacaq funksiyalar üçün default: anon-a icazə verilmir
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;