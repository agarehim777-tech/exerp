
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$ SELECT private.is_platform_admin(_user) $$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$ SELECT private.is_tenant_member(_tenant, _user) $$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$ SELECT private.is_tenant_admin(_tenant, _user) $$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO service_role;
