
-- 1. Create private schema (hidden from PostgREST API)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2. Move helper SECURITY DEFINER functions out of exposed public schema.
-- Policy and function references are by OID, so they continue to resolve.
ALTER FUNCTION public.is_tenant_member(uuid, uuid)         SET SCHEMA private;
ALTER FUNCTION public.is_tenant_admin(uuid, uuid)          SET SCHEMA private;
ALTER FUNCTION public.has_tenant_role(uuid, uuid, app_role) SET SCHEMA private;
ALTER FUNCTION public.is_platform_admin(uuid)              SET SCHEMA private;
ALTER FUNCTION public.current_tenant_id()                  SET SCHEMA private;
ALTER FUNCTION public.has_module_access(uuid, text, text)  SET SCHEMA private;

-- 3. Ensure authenticated retains EXECUTE (needed for RLS policy evaluation),
-- but revoke from PUBLIC/anon to keep surface minimal.
REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_tenant_admin(uuid, uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_tenant_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_platform_admin(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_tenant_id()                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_module_access(uuid, text, text)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_tenant_role(uuid, uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_admin(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_tenant_id()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_module_access(uuid, text, text)  TO authenticated, service_role;

-- 4. Update the self-healing grant checker to reference the new schema.
CREATE OR REPLACE FUNCTION public.ensure_rls_helper_grants()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  missing text[] := ARRAY[]::text[];
  fixed   text[] := ARRAY[]::text[];
  fn text;
  fns text[] := ARRAY[
    'private.is_tenant_member(uuid,uuid)',
    'private.is_tenant_admin(uuid,uuid)',
    'private.is_platform_admin(uuid)',
    'private.current_tenant_id()',
    'private.has_module_access(uuid,text,text)',
    'private.has_tenant_role(uuid,uuid,app_role)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      missing := array_append(missing, fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
      IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN
        fixed := array_append(fixed, fn);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'missing_before', to_jsonb(missing),
    'repaired', to_jsonb(fixed),
    'healthy', (array_length(missing,1) IS NULL)
  );
END;
$function$;
