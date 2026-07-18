-- ============ ENUM ============
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- ============ TENANTS ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============ TENANT MEMBERS ============
CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX tenant_members_user_idx ON public.tenant_members(user_id);
CREATE INDEX tenant_members_tenant_idx ON public.tenant_members(tenant_id);

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  active_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ APP LOGS ============
CREATE TABLE public.app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id uuid,
  level text NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  source text,
  message text NOT NULL,
  context jsonb,
  stack text,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.app_logs TO authenticated;
GRANT ALL ON public.app_logs TO service_role;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX app_logs_tenant_created_idx ON public.app_logs(tenant_id, created_at DESC);

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant uuid, _user uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = _user AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT active_tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ============ TENANT CREATION (atomic: tenant + owner membership + set active) ============
CREATE OR REPLACE FUNCTION public.create_tenant(_name text, _slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.tenants(name, slug, created_by) VALUES (_name, _slug, uid) RETURNING id INTO new_id;
  INSERT INTO public.tenant_members(tenant_id, user_id, role) VALUES (new_id, uid, 'owner');
  UPDATE public.profiles SET active_tenant_id = COALESCE(active_tenant_id, new_id) WHERE id = uid;
  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_tenant(text, text) TO authenticated;

-- ============ POLICIES: profiles ============
CREATE POLICY profiles_own_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_own_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============ POLICIES: tenants ============
CREATE POLICY tenants_member_select ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(id, auth.uid()));
CREATE POLICY tenants_owner_update ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_tenant_role(id, auth.uid(), 'owner'))
  WITH CHECK (public.has_tenant_role(id, auth.uid(), 'owner'));
CREATE POLICY tenants_owner_delete ON public.tenants FOR DELETE TO authenticated
  USING (public.has_tenant_role(id, auth.uid(), 'owner'));
-- Insert only via create_tenant() function, so no INSERT policy needed for direct writes.

-- ============ POLICIES: tenant_members ============
CREATE POLICY tm_select_same_tenant ON public.tenant_members FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY tm_insert_admin ON public.tenant_members FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));
CREATE POLICY tm_update_admin ON public.tenant_members FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));
CREATE POLICY tm_delete_admin ON public.tenant_members FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()) OR user_id = auth.uid());

-- ============ POLICIES: app_logs ============
CREATE POLICY logs_insert ON public.app_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY logs_select ON public.app_logs FOR SELECT TO authenticated
  USING (
    (tenant_id IS NULL AND user_id = auth.uid())
    OR (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id, auth.uid()))
  );

-- ============ TRIGGER: auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ updated_at triggers ============
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();