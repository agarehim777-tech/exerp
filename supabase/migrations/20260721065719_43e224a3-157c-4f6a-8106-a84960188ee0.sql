
CREATE OR REPLACE FUNCTION public.check_my_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  tid uuid;
  role_name text;
  is_pa boolean;
  is_admin boolean;
  perms jsonb;
  mods jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT active_tenant_id INTO tid FROM public.profiles WHERE id = uid;
  is_pa := public.is_platform_admin(uid);

  SELECT role::text INTO role_name FROM public.tenant_members
   WHERE user_id = uid AND tenant_id = tid;

  is_admin := role_name IN ('owner','admin');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('module', module, 'can_view', can_view, 'can_edit', can_edit) ORDER BY module), '[]'::jsonb)
    INTO perms
    FROM public.role_permissions WHERE role::text = role_name;

  SELECT COALESCE(jsonb_agg(module ORDER BY module), '[]'::jsonb)
    INTO mods
    FROM public.tenant_modules WHERE tenant_id = tid;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', uid,
    'active_tenant_id', tid,
    'role', role_name,
    'is_tenant_admin', COALESCE(is_admin, false),
    'is_platform_admin', is_pa,
    'is_tenant_member', role_name IS NOT NULL,
    'enabled_modules', mods,
    'role_permissions', perms,
    'checked_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.check_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_project_access(_project uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p RECORD;
  is_owner boolean;
  is_member boolean;
  is_admin boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT id, tenant_id, user_id, name, status INTO p
    FROM public.projects WHERE id = _project;

  IF p.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'project_id', _project);
  END IF;

  is_owner := (p.user_id = uid);
  is_member := public.is_tenant_member(p.tenant_id, uid);
  is_admin := public.is_tenant_admin(p.tenant_id, uid);

  RETURN jsonb_build_object(
    'found', true,
    'project_id', p.id,
    'name', p.name,
    'status', p.status,
    'tenant_id', p.tenant_id,
    'owner_user_id', p.user_id,
    'is_owner', is_owner,
    'is_tenant_member', is_member,
    'is_tenant_admin', is_admin,
    'can_view', is_member OR is_owner,
    'can_edit', is_admin OR is_owner,
    'checked_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.check_project_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_project_access(uuid) TO authenticated;
