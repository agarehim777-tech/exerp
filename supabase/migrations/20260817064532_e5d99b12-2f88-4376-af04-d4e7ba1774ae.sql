CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_tenant_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION private.has_tenant_role(_tenant uuid, _user uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_tenant_admin(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT active_tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user);
$$;

CREATE OR REPLACE FUNCTION private.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (NOT EXISTS (SELECT 1 FROM public.tenant_modules WHERE tenant_id = _tenant)
      OR EXISTS (SELECT 1 FROM public.tenant_modules WHERE tenant_id = _tenant AND module = _module))
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.role_permissions rp ON rp.role = tm.role AND rp.module = _module
      WHERE tm.tenant_id = _tenant
        AND tm.user_id = auth.uid()
        AND ((_action = 'view' AND rp.can_view) OR (_action = 'edit' AND rp.can_edit))
    );
$$;

-- Public wrappers for existing RLS policies that reference public.* helpers.
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.is_tenant_member(_tenant, _user);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.is_tenant_admin(_tenant, _user);
$$;

REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_tenant_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_module_access(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_tenant_role(uuid, uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_module_access(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated, service_role;