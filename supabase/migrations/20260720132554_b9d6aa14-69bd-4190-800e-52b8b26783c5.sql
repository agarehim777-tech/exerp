ALTER TABLE public.projects ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.projects ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS projects_tenant_id_idx ON public.projects(tenant_id);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id);

DROP POLICY IF EXISTS projects_owner_all ON public.projects;
CREATE POLICY "projects_tenant_member_read" ON public.projects
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "projects_tenant_admin_write" ON public.projects
  FOR ALL TO authenticated
  USING (is_tenant_admin(tenant_id, auth.uid()) OR (user_id = auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()) OR (user_id = auth.uid()));

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  full_name text NOT NULL,
  position text,
  department text,
  phone text,
  salary numeric(14,2),
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_tenant_member_read" ON public.employees
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "employees_tenant_admin_write" ON public.employees
  FOR ALL TO authenticated
  USING (is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (is_tenant_admin(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS employees_tenant_id_idx ON public.employees(tenant_id);
CREATE INDEX IF NOT EXISTS employees_user_id_idx ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS employees_email_idx ON public.employees(email);

CREATE OR REPLACE FUNCTION public.update_employees_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_employees_updated_at();