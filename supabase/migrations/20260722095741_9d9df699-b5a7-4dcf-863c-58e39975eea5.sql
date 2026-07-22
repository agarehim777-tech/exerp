-- Self-healing helper: re-applies EXECUTE grants required by RLS policies.
CREATE OR REPLACE FUNCTION public.ensure_rls_helper_grants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
  fixed   text[] := ARRAY[]::text[];
  fn text;
  fns text[] := ARRAY[
    'public.is_tenant_member(uuid,uuid)',
    'public.is_tenant_admin(uuid,uuid)',
    'public.is_platform_admin(uuid)',
    'public.current_tenant_id()',
    'public.has_module_access(uuid,text,text)',
    'public.has_tenant_role(uuid,uuid,app_role)'
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
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_rls_helper_grants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_rls_helper_grants() TO service_role;

-- Platform-admin diagnostic wrapper
CREATE OR REPLACE FUNCTION public.platform_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.ensure_rls_helper_grants();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.platform_health_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_health_check() TO authenticated;

-- Wire the self-heal into tenant-creation paths so a new company can never
-- boot into a broken permission state.
CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  _name text, _slug text, _max_users integer DEFAULT 10, _plan text DEFAULT 'starter',
  _modules text[] DEFAULT NULL, _expires_at date DEFAULT NULL, _notes text DEFAULT NULL,
  _admin_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid; m text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.tenants(name, slug, created_by, max_users, plan_name, expires_at, notes)
    VALUES (_name, _slug, auth.uid(), COALESCE(_max_users,10), COALESCE(_plan,'starter'), _expires_at, _notes)
    RETURNING id INTO new_id;

  IF _modules IS NOT NULL THEN
    FOREACH m IN ARRAY _modules LOOP
      INSERT INTO public.tenant_modules(tenant_id, module) VALUES (new_id, m)
        ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  PERFORM public.ensure_rls_helper_grants();
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_tenant(_name text, _slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
  _has_any_admin boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.platform_admins) INTO _has_any_admin;
  IF _has_any_admin AND NOT public.is_platform_admin(uid) THEN
    RAISE EXCEPTION 'forbidden: only platform administrators can create tenants';
  END IF;

  INSERT INTO public.tenants(name, slug, created_by) VALUES (_name, _slug, uid) RETURNING id INTO new_id;
  INSERT INTO public.tenant_members(tenant_id, user_id, role) VALUES (new_id, uid, 'owner');
  UPDATE public.profiles SET active_tenant_id = COALESCE(active_tenant_id, new_id) WHERE id = uid;

  IF NOT _has_any_admin THEN
    INSERT INTO public.platform_admins(user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.ensure_rls_helper_grants();
  RETURN new_id;
END;
$$;

-- Run once now so state is healthy immediately.
SELECT public.ensure_rls_helper_grants();