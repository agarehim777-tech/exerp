CREATE OR REPLACE FUNCTION public.create_tenant_invite(_tenant uuid, _email text, _role app_role)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _tok text;
BEGIN
  IF NOT (private.is_tenant_admin(_tenant, auth.uid()) OR private.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.tenant_invites (tenant_id, email, role, invited_by)
  VALUES (_tenant, lower(trim(_email)), _role, auth.uid())
  RETURNING tenant_invites.id, tenant_invites.token INTO _id, _tok;

  RETURN QUERY SELECT _id, _tok;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_invite(uuid, text, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_invite(uuid, text, app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_invite_token(_invite uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _tok text;
BEGIN
  SELECT tenant_id, token INTO _tenant, _tok FROM public.tenant_invites WHERE id = _invite;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;
  IF NOT (private.is_tenant_admin(_tenant, auth.uid()) OR private.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN _tok;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_invite_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_invite_token(uuid) TO authenticated;