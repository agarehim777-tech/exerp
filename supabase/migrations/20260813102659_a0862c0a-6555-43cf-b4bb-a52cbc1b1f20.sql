CREATE TABLE IF NOT EXISTS public.po_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference_no TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_payments TO authenticated;
GRANT ALL ON public.po_payments TO service_role;

ALTER TABLE public.po_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_payments_tenant_all ON public.po_payments;
CREATE POLICY po_payments_tenant_all ON public.po_payments FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_po_payments_updated ON public.po_payments;
CREATE TRIGGER trg_po_payments_updated BEFORE UPDATE ON public.po_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_po_payments_tenant ON public.po_payments(tenant_id, po_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_po_payments_po ON public.po_payments(po_id);
