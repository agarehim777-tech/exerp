CREATE OR REPLACE FUNCTION public.platform_create_tenant(_name text, _slug text, _max_users integer DEFAULT 10, _plan text DEFAULT 'starter'::text, _modules text[] DEFAULT NULL::text[], _expires_at date DEFAULT NULL::date, _notes text DEFAULT NULL::text, _admin_email text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Admin user is provisioned via edge function (platform-provision-admin), not here.
  RETURN new_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.platform_create_tenant(text,text,integer,text,text[],date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,integer,text,text[],date,text,text) TO authenticated;