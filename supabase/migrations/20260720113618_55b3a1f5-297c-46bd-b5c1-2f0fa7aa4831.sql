CREATE OR REPLACE FUNCTION public.create_tenant(_name text, _slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
  _has_any_admin boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.platform_admins) INTO _has_any_admin;

  -- Only platform admins can create tenants.
  -- Exception: if no platform admin exists yet, allow the very first user to
  -- bootstrap the first tenant (initial setup).
  IF _has_any_admin AND NOT public.is_platform_admin(uid) THEN
    RAISE EXCEPTION 'forbidden: only platform administrators can create tenants';
  END IF;

  INSERT INTO public.tenants(name, slug, created_by) VALUES (_name, _slug, uid) RETURNING id INTO new_id;
  INSERT INTO public.tenant_members(tenant_id, user_id, role) VALUES (new_id, uid, 'owner');
  UPDATE public.profiles SET active_tenant_id = COALESCE(active_tenant_id, new_id) WHERE id = uid;

  -- Auto-elevate the first-ever tenant creator to platform admin so they can
  -- keep provisioning further companies.
  IF NOT _has_any_admin THEN
    INSERT INTO public.platform_admins(user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  END IF;

  RETURN new_id;
END;
$function$;