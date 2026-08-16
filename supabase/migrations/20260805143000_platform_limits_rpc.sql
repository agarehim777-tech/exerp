CREATE OR REPLACE FUNCTION public.platform_set_tenant_limits(
  _tenant UUID,
  _max_users INTEGER,
  _max_warehouses INTEGER DEFAULT 3,
  _max_storage_mb INTEGER DEFAULT 1024,
  _enabled_modules TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS public.tenant_limits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.tenant_limits;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.tenant_limits (
    tenant_id, max_users, max_warehouses, max_storage_mb, enabled_modules, updated_at
  ) VALUES (
    _tenant,
    GREATEST(1, COALESCE(_max_users, 10)),
    GREATEST(1, COALESCE(_max_warehouses, 3)),
    GREATEST(128, COALESCE(_max_storage_mb, 1024)),
    COALESCE(_enabled_modules, ARRAY[]::TEXT[]),
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    max_users = EXCLUDED.max_users,
    max_warehouses = EXCLUDED.max_warehouses,
    max_storage_mb = EXCLUDED.max_storage_mb,
    enabled_modules = EXCLUDED.enabled_modules,
    updated_at = now()
  RETURNING * INTO result;

  INSERT INTO public.audit_events (id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::TEXT,
    _tenant,
    auth.uid(),
    'platform',
    'tenant_limits_updated',
    'Tenant limitləri və modul lisenziyaları yeniləndi',
    jsonb_build_object(
      'max_users', result.max_users,
      'max_warehouses', result.max_warehouses,
      'max_storage_mb', result.max_storage_mb,
      'enabled_modules', result.enabled_modules
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_tenant_limits(UUID, INTEGER, INTEGER, INTEGER, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_limits(UUID, INTEGER, INTEGER, INTEGER, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_tenant_usage()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_status TEXT,
  member_count BIGINT,
  warehouse_count BIGINT,
  max_users INTEGER,
  max_warehouses INTEGER,
  max_storage_mb INTEGER,
  enabled_modules TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    COALESCE(t.status::TEXT, 'active'),
    (SELECT count(*) FROM public.tenant_members tm WHERE tm.tenant_id = t.id),
    (SELECT count(*) FROM public.warehouses w WHERE w.tenant_id = t.id),
    COALESCE(l.max_users, 10),
    COALESCE(l.max_warehouses, 3),
    COALESCE(l.max_storage_mb, 1024),
    COALESCE(l.enabled_modules, ARRAY[]::TEXT[])
  FROM public.tenants t
  LEFT JOIN public.tenant_limits l ON l.tenant_id = t.id
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_tenant_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_tenant_usage() TO authenticated;

