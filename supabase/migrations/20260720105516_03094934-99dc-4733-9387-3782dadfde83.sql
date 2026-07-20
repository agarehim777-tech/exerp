
-- 1) Extend tenants with lifecycle + limits
DO $$ BEGIN
  CREATE TYPE public.tenant_status AS ENUM ('active','frozen','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status public.tenant_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2) Platform-level super admins
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pa_self_read ON public.platform_admins;
CREATE POLICY pa_self_read ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id = _user) $$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- Bootstrap: first authenticated user who calls this becomes platform admin
CREATE OR REPLACE FUNCTION public.platform_bootstrap_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins) THEN
    RETURN public.is_platform_admin(uid);
  END IF;
  INSERT INTO public.platform_admins(user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_bootstrap_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_bootstrap_admin() TO authenticated;

-- 3) Tenant modules (enabled feature set)
CREATE TABLE IF NOT EXISTS public.tenant_modules (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  PRIMARY KEY (tenant_id, module)
);
GRANT SELECT ON public.tenant_modules TO authenticated;
GRANT ALL ON public.tenant_modules TO service_role;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tmod_read ON public.tenant_modules;
CREATE POLICY tmod_read ON public.tenant_modules FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- 4) Platform can see/manage all tenants
DROP POLICY IF EXISTS tenants_platform_all ON public.tenants;
CREATE POLICY tenants_platform_all ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS tm_platform_all ON public.tenant_members;
CREATE POLICY tm_platform_all ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS invites_platform_all ON public.tenant_invites;
CREATE POLICY invites_platform_all ON public.tenant_invites FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 5) Enforce max_users on tenant_members inserts
CREATE OR REPLACE FUNCTION public.enforce_tenant_user_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _max int; _current int; _status public.tenant_status;
BEGIN
  SELECT max_users, status INTO _max, _status FROM public.tenants WHERE id = NEW.tenant_id;
  IF _status = 'frozen' THEN
    RAISE EXCEPTION 'tenant is frozen';
  END IF;
  IF _status = 'deleted' THEN
    RAISE EXCEPTION 'tenant is deleted';
  END IF;
  SELECT COUNT(*) INTO _current FROM public.tenant_members WHERE tenant_id = NEW.tenant_id;
  IF _max IS NOT NULL AND _current >= _max THEN
    RAISE EXCEPTION 'user limit reached for this tenant (max %)', _max;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_tenant_user_limit_trg ON public.tenant_members;
CREATE TRIGGER enforce_tenant_user_limit_trg BEFORE INSERT ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_user_limit();

-- 6) Extend module access check with tenant_modules
CREATE OR REPLACE FUNCTION public.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- module must be enabled for tenant (if any modules configured)
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

-- 7) Platform RPCs
CREATE OR REPLACE FUNCTION public.platform_list_tenants()
RETURNS TABLE(
  id uuid, name text, slug text, status public.tenant_status,
  max_users int, plan_name text, expires_at date, notes text,
  created_at timestamptz, frozen_at timestamptz, deleted_at timestamptz,
  member_count bigint, modules text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.slug, t.status, t.max_users, t.plan_name, t.expires_at, t.notes,
           t.created_at, t.frozen_at, t.deleted_at,
           (SELECT COUNT(*) FROM public.tenant_members m WHERE m.tenant_id = t.id),
           COALESCE((SELECT array_agg(module ORDER BY module) FROM public.tenant_modules WHERE tenant_id = t.id), ARRAY[]::text[])
    FROM public.tenants t
    ORDER BY t.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_list_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_tenants() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  _name text, _slug text, _max_users int DEFAULT 10,
  _plan text DEFAULT 'starter', _modules text[] DEFAULT NULL,
  _expires_at date DEFAULT NULL, _notes text DEFAULT NULL,
  _admin_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_id uuid; m text; tok text;
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

  IF _admin_email IS NOT NULL AND length(trim(_admin_email)) > 0 THEN
    tok := encode(gen_random_bytes(24), 'hex');
    INSERT INTO public.tenant_invites(tenant_id, email, role, token, invited_by, expires_at)
      VALUES (new_id, lower(trim(_admin_email)), 'admin', tok, auth.uid(), now() + interval '14 days');
  END IF;

  RETURN new_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_create_tenant(text,text,int,text,text[],date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,int,text,text[],date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_update_tenant(
  _tenant uuid, _name text DEFAULT NULL, _max_users int DEFAULT NULL,
  _plan text DEFAULT NULL, _expires_at date DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tenants SET
    name = COALESCE(_name, name),
    max_users = COALESCE(_max_users, max_users),
    plan_name = COALESCE(_plan, plan_name),
    expires_at = COALESCE(_expires_at, expires_at),
    notes = COALESCE(_notes, notes),
    updated_at = now()
  WHERE id = _tenant;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_update_tenant(uuid,text,int,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant(uuid,text,int,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_status(_tenant uuid, _status public.tenant_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tenants SET
    status = _status,
    frozen_at = CASE WHEN _status = 'frozen' THEN now() ELSE NULL END,
    deleted_at = CASE WHEN _status = 'deleted' THEN now() ELSE deleted_at END,
    updated_at = now()
  WHERE id = _tenant;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid, public.tenant_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid, public.tenant_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.tenants WHERE id = _tenant;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_delete_tenant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_modules(_tenant uuid, _modules text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE m text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.tenant_modules WHERE tenant_id = _tenant;
  IF _modules IS NOT NULL THEN
    FOREACH m IN ARRAY _modules LOOP
      INSERT INTO public.tenant_modules(tenant_id, module) VALUES (_tenant, m)
        ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_set_tenant_modules(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_modules(uuid, text[]) TO authenticated;
