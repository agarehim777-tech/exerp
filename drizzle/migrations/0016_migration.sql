CREATE OR REPLACE FUNCTION public.check_project_access(_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT id, tenant_id, user_id, name, status INTO p FROM public.projects WHERE id = _project;
  IF p.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'project_id', _project);
  END IF;
  is_owner := (p.user_id = uid);
  is_member := public.is_tenant_member(p.tenant_id, uid);
  is_admin := public.is_tenant_admin(p.tenant_id, uid);
  IF NOT (is_owner OR is_member) THEN
    RETURN jsonb_build_object('found', false, 'project_id', _project);
  END IF;
  RETURN jsonb_build_object(
    'found', true, 'project_id', p.id, 'name', p.name, 'status', p.status,
    'tenant_id', p.tenant_id, 'owner_user_id', p.user_id,
    'is_owner', is_owner, 'is_tenant_member', is_member, 'is_tenant_admin', is_admin,
    'can_view', is_member OR is_owner, 'can_edit', is_admin OR is_owner, 'checked_at', now());
END $$;
REVOKE ALL ON FUNCTION public.check_project_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_project_access(uuid) TO authenticated;