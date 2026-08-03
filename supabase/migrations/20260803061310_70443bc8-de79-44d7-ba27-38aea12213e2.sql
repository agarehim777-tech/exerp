-- Internal-only helpers: not called from the client, revoke direct API access
REVOKE ALL ON FUNCTION public.is_period_locked(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_account_by_code(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_pipeline_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_health_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_period_locked(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_account_by_code(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_pipeline_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_health_check() TO service_role;

-- RLS helper wrappers must stay callable (used inside policies) but do not need
-- definer rights themselves: the private.* implementations are SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$ SELECT private.is_tenant_member(_tenant, _user) $$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$ SELECT private.is_tenant_admin(_tenant, _user) $$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$ SELECT private.is_platform_admin(_user) $$;

SELECT public.ensure_rls_helper_grants();