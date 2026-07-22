
-- 1) Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- 2) Revoke EXECUTE from authenticated on internal helpers (called only from RLS/triggers via definer chain).
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.bump_customer_activity() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_journal_balance() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_tenant_user_limit() FROM authenticated;
REVOKE ALL ON FUNCTION public.update_employees_updated_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_doc_number(uuid, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_member(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.has_module_access(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM authenticated;

-- 3) Prevent admins from promoting anyone to 'owner'. Only existing owners or platform admins may set 'owner'.
DROP POLICY IF EXISTS tm_update_admin ON public.tenant_members;
CREATE POLICY tm_update_admin ON public.tenant_members
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (
    public.is_tenant_admin(tenant_id, auth.uid())
    AND (
      role <> 'owner'
      OR public.has_tenant_role(tenant_id, auth.uid(), 'owner')
      OR public.is_platform_admin(auth.uid())
    )
  );

-- Also restrict inserts of 'owner' role to existing owners/platform admins.
DROP POLICY IF EXISTS tm_insert_admin ON public.tenant_members;
CREATE POLICY tm_insert_admin ON public.tenant_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_admin(tenant_id, auth.uid())
    AND (
      role <> 'owner'
      OR public.has_tenant_role(tenant_id, auth.uid(), 'owner')
      OR public.is_platform_admin(auth.uid())
    )
  );

-- 4) Explicit restrictive deny on tenant_invites so token column can never leak to non-admins,
--    even if a future permissive policy is added by mistake.
CREATE POLICY invites_deny_non_admin ON public.tenant_invites
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_admin(tenant_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );
