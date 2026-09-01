CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  delivery_no text,
  status text NOT NULL DEFAULT 'delivered',
  recipient_name text,
  recipient_document text,
  acceptance_name text,
  acceptance_document_no text,
  acceptance_signature text,
  acceptance_note text,
  warehouse_employee_name text,
  delivered_at timestamptz,
  delivered_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_tenant_order_key ON public.deliveries(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant ON public.deliveries(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read deliveries" ON public.deliveries
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "Tenant members write deliveries" ON public.deliveries
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "Tenant members update deliveries" ON public.deliveries
  FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "Tenant admins delete deliveries" ON public.deliveries
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();