CREATE OR REPLACE FUNCTION public.audit_tenant_rls()
RETURNS TABLE (
  table_name TEXT,
  rls_enabled BOOLEAN,
  select_policy_count BIGINT,
  write_policy_count BIGINT,
  secure BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH tenant_tables AS (
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND a.attname = 'tenant_id'
      AND NOT a.attisdropped
  ),
  policy_counts AS (
    SELECT
      p.tablename,
      count(*) FILTER (WHERE p.cmd IN ('SELECT', 'ALL')) AS select_count,
      count(*) FILTER (WHERE p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')) AS write_count
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
    GROUP BY p.tablename
  )
  SELECT
    t.relname::TEXT,
    t.relrowsecurity,
    COALESCE(p.select_count, 0),
    COALESCE(p.write_count, 0),
    (
      t.relrowsecurity
      AND COALESCE(p.select_count, 0) > 0
      AND COALESCE(p.write_count, 0) > 0
    )
  FROM tenant_tables t
  LEFT JOIN policy_counts p ON p.tablename = t.relname
  ORDER BY t.relname;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tenant_rls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_tenant_rls() TO authenticated, service_role;

COMMENT ON FUNCTION public.audit_tenant_rls() IS
  'Platform-admin-only audit of RLS and tenant policies on public tenant-scoped tables.';

