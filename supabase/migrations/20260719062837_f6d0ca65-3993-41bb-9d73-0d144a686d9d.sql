
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'individual' CHECK (segment IN ('individual','business','vip')),
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_tax_unique ON public.customers(tenant_id, tax_id) WHERE tax_id IS NOT NULL AND tax_id <> '';
CREATE INDEX IF NOT EXISTS customers_owner_idx ON public.customers(owner_id);

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines_read" ON public.crm_pipelines FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_pipelines_write" ON public.crm_pipelines FOR ALL TO authenticated USING (public.is_tenant_admin(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));
CREATE TRIGGER trg_crm_pipelines_updated BEFORE UPDATE ON public.crm_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  probability numeric(5,2) NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#64748b',
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stages_read" ON public.crm_stages FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_stages_write" ON public.crm_stages FOR ALL TO authenticated USING (public.is_tenant_admin(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS crm_stages_pipeline_idx ON public.crm_stages(pipeline_id, sort_order);

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AZN',
  expected_close date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  lost_reason text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT ALL ON public.crm_deals TO service_role;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deals_read" ON public.crm_deals FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_deals_write" ON public.crm_deals FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) AND (owner_id = auth.uid() OR public.has_module_access(tenant_id, 'crm', 'edit')))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()) AND (owner_id = auth.uid() OR public.has_module_access(tenant_id, 'crm', 'edit')));
CREATE INDEX IF NOT EXISTS crm_deals_stage_idx ON public.crm_deals(stage_id, sort_order);
CREATE INDEX IF NOT EXISTS crm_deals_tenant_idx ON public.crm_deals(tenant_id, status);
CREATE INDEX IF NOT EXISTS crm_deals_customer_idx ON public.crm_deals(customer_id);
CREATE TRIGGER trg_crm_deals_updated BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('call','meeting','email','note','sms')),
  subject text NOT NULL,
  body text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_read" ON public.crm_activities FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_activities_write" ON public.crm_activities FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS crm_activities_customer_idx ON public.crm_activities(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_deal_idx ON public.crm_activities(deal_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_tasks_read" ON public.crm_tasks FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_tasks_write" ON public.crm_tasks FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON public.crm_tasks(tenant_id, done, due_at);
CREATE TRIGGER trg_crm_tasks_updated BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#10b981',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags TO authenticated;
GRANT ALL ON public.crm_tags TO service_role;
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_tags_read" ON public.crm_tags FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_tags_write" ON public.crm_tags FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.crm_customer_tags (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_customer_tags TO authenticated;
GRANT ALL ON public.crm_customer_tags TO service_role;
ALTER TABLE public.crm_customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_customer_tags_read" ON public.crm_customer_tags FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "crm_customer_tags_write" ON public.crm_customer_tags FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.seed_default_crm_pipeline(_tenant uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  IF NOT public.is_tenant_admin(_tenant, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.crm_pipelines WHERE tenant_id = _tenant) THEN
    SELECT id INTO pid FROM public.crm_pipelines WHERE tenant_id = _tenant ORDER BY created_at LIMIT 1;
    RETURN pid;
  END IF;
  INSERT INTO public.crm_pipelines(tenant_id, name, is_default) VALUES (_tenant, 'Satış', true) RETURNING id INTO pid;
  INSERT INTO public.crm_stages(tenant_id, pipeline_id, name, sort_order, probability, color, is_won, is_lost) VALUES
    (_tenant, pid, 'Yeni',           1, 10, '#94a3b8', false, false),
    (_tenant, pid, 'Kvalifikasiya',  2, 25, '#38bdf8', false, false),
    (_tenant, pid, 'Təklif',         3, 50, '#a78bfa', false, false),
    (_tenant, pid, 'Danışıq',        4, 75, '#f59e0b', false, false),
    (_tenant, pid, 'Qazanıldı',      5, 100,'#10b981', true,  false),
    (_tenant, pid, 'İtirildi',       6, 0,  '#ef4444', false, true );
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.crm_pipeline_summary(_pipeline uuid)
RETURNS TABLE(stage_id uuid, stage_name text, color text, sort_order int, deal_count bigint, total_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.color, s.sort_order,
         COALESCE(COUNT(d.id),0), COALESCE(SUM(d.amount),0)
  FROM public.crm_stages s
  LEFT JOIN public.crm_deals d ON d.stage_id = s.id AND d.status = 'open'
  WHERE s.pipeline_id = _pipeline
    AND EXISTS (SELECT 1 FROM public.crm_pipelines p WHERE p.id = _pipeline AND public.is_tenant_member(p.tenant_id, auth.uid()))
  GROUP BY s.id, s.name, s.color, s.sort_order
  ORDER BY s.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.customer_360(_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer AND public.is_tenant_member(c.tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'customer', to_jsonb(c.*),
    'open_deals', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM public.crm_deals d WHERE d.customer_id = _customer AND d.status = 'open'), '[]'::jsonb),
    'won_amount', COALESCE((SELECT SUM(amount) FROM public.crm_deals WHERE customer_id = _customer AND status = 'won'), 0),
    'activities', COALESCE((SELECT jsonb_agg(to_jsonb(a.*)) FROM (SELECT * FROM public.crm_activities WHERE customer_id = _customer ORDER BY occurred_at DESC LIMIT 20) a), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM public.crm_tasks t WHERE t.customer_id = _customer AND NOT t.done), '[]'::jsonb),
    'orders_total', COALESCE((SELECT SUM(total_amount) FROM public.orders WHERE customer_id = _customer), 0),
    'orders_count', COALESCE((SELECT COUNT(*) FROM public.orders WHERE customer_id = _customer), 0),
    'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name, 'color', tg.color)) FROM public.crm_customer_tags ct JOIN public.crm_tags tg ON tg.id = ct.tag_id WHERE ct.customer_id = _customer), '[]'::jsonb)
  ) INTO result FROM public.customers c WHERE c.id = _customer;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bump_customer_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers SET last_activity_at = NEW.occurred_at WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_crm_activity_bump AFTER INSERT ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.bump_customer_activity();

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_stages;
