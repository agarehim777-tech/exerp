
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_tenant_all ON public.vendors FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.po_status AS ENUM ('draft','approved','partial','received','closed','cancelled');

CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  status public.po_status NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  currency TEXT NOT NULL DEFAULT 'AZN',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_tenant_all ON public.purchase_orders FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.purchase_order_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  product_sku TEXT NOT NULL,
  description TEXT,
  qty_ordered NUMERIC(14,3) NOT NULL CHECK (qty_ordered > 0),
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (po_id, line_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY pol_tenant_all ON public.purchase_order_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.is_tenant_member(p.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND public.is_tenant_member(p.tenant_id, auth.uid())));
CREATE TRIGGER trg_pol_updated BEFORE UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.goods_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  grn_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grn_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY grn_tenant_all ON public.goods_receipts FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_grn_updated BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.goods_receipt_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  qty_received NUMERIC(14,3) NOT NULL CHECK (qty_received > 0),
  qty_rejected NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_lines TO authenticated;
GRANT ALL ON public.goods_receipt_lines TO service_role;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY grnl_tenant_all ON public.goods_receipt_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = grn_id AND public.is_tenant_member(g.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = grn_id AND public.is_tenant_member(g.tenant_id, auth.uid())));
CREATE TRIGGER trg_grnl_updated BEFORE UPDATE ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.invoice_status AS ENUM ('draft','matched','exception','approved','paid','cancelled');

CREATE TABLE public.vendor_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'AZN',
  status public.invoice_status NOT NULL DEFAULT 'draft',
  match_notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vendor_id, invoice_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invoices TO authenticated;
GRANT ALL ON public.vendor_invoices TO service_role;
ALTER TABLE public.vendor_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY vi_tenant_all ON public.vendor_invoices FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_vi_updated BEFORE UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vendor_invoice_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.vendor_invoices(id) ON DELETE CASCADE,
  po_line_id UUID REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL,
  description TEXT,
  qty_invoiced NUMERIC(14,3) NOT NULL CHECK (qty_invoiced > 0),
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invoice_lines TO authenticated;
GRANT ALL ON public.vendor_invoice_lines TO service_role;
ALTER TABLE public.vendor_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY vil_tenant_all ON public.vendor_invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendor_invoices v WHERE v.id = invoice_id AND public.is_tenant_member(v.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendor_invoices v WHERE v.id = invoice_id AND public.is_tenant_member(v.tenant_id, auth.uid())));
CREATE TRIGGER trg_vil_updated BEFORE UPDATE ON public.vendor_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.po_line_match AS
SELECT
  pol.id AS po_line_id,
  po.id AS po_id,
  po.tenant_id,
  po.po_number,
  pol.line_no,
  pol.product_sku,
  pol.qty_ordered,
  pol.unit_price AS po_unit_price,
  COALESCE(SUM(grnl.qty_received - grnl.qty_rejected), 0) AS qty_accepted,
  COALESCE((SELECT SUM(vil.qty_invoiced) FROM public.vendor_invoice_lines vil WHERE vil.po_line_id = pol.id), 0) AS qty_invoiced,
  COALESCE((SELECT AVG(vil.unit_price) FROM public.vendor_invoice_lines vil WHERE vil.po_line_id = pol.id), 0) AS avg_invoice_price
FROM public.purchase_order_lines pol
JOIN public.purchase_orders po ON po.id = pol.po_id
LEFT JOIN public.goods_receipt_lines grnl ON grnl.po_line_id = pol.id
GROUP BY pol.id, po.id, po.tenant_id, po.po_number, pol.line_no, pol.product_sku, pol.qty_ordered, pol.unit_price;

GRANT SELECT ON public.po_line_match TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_invoice_match(
  _invoice_id UUID,
  _qty_tolerance NUMERIC DEFAULT 0.00,
  _price_tolerance NUMERIC DEFAULT 0.02
)
RETURNS TABLE (
  po_line_id UUID,
  line_no INT,
  product_sku TEXT,
  qty_ordered NUMERIC,
  qty_accepted NUMERIC,
  qty_invoiced NUMERIC,
  po_unit_price NUMERIC,
  invoice_unit_price NUMERIC,
  qty_ok BOOLEAN,
  price_ok BOOLEAN,
  status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vil.po_line_id,
    pol.line_no,
    pol.product_sku,
    pol.qty_ordered,
    COALESCE((SELECT SUM(grnl.qty_received - grnl.qty_rejected)
              FROM public.goods_receipt_lines grnl
              WHERE grnl.po_line_id = pol.id), 0) AS qty_accepted,
    vil.qty_invoiced,
    pol.unit_price,
    vil.unit_price AS invoice_unit_price,
    (vil.qty_invoiced <= COALESCE((SELECT SUM(grnl.qty_received - grnl.qty_rejected)
                                    FROM public.goods_receipt_lines grnl
                                    WHERE grnl.po_line_id = pol.id), 0) * (1 + _qty_tolerance)) AS qty_ok,
    (ABS(vil.unit_price - pol.unit_price) <= pol.unit_price * _price_tolerance) AS price_ok,
    CASE
      WHEN pol.id IS NULL THEN 'no_po_link'
      WHEN vil.qty_invoiced > COALESCE((SELECT SUM(grnl.qty_received - grnl.qty_rejected)
                                         FROM public.goods_receipt_lines grnl
                                         WHERE grnl.po_line_id = pol.id), 0) * (1 + _qty_tolerance)
        THEN 'qty_exception'
      WHEN ABS(vil.unit_price - pol.unit_price) > pol.unit_price * _price_tolerance
        THEN 'price_exception'
      ELSE 'matched'
    END AS status
  FROM public.vendor_invoice_lines vil
  LEFT JOIN public.purchase_order_lines pol ON pol.id = vil.po_line_id
  WHERE vil.invoice_id = _invoice_id
    AND EXISTS (
      SELECT 1 FROM public.vendor_invoices vi
      WHERE vi.id = _invoice_id AND public.is_tenant_member(vi.tenant_id, auth.uid())
    );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_invoice_match(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_invoice_match(UUID, NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_invoice_match(
  _invoice_id UUID,
  _qty_tolerance NUMERIC DEFAULT 0.00,
  _price_tolerance NUMERIC DEFAULT 0.02
)
RETURNS public.invoice_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_exception BOOLEAN;
  _has_any_line BOOLEAN;
  _new_status public.invoice_status;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vendor_invoices vi
                  WHERE vi.id = _invoice_id AND public.is_tenant_member(vi.tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.evaluate_invoice_match(_invoice_id, _qty_tolerance, _price_tolerance)
    WHERE status <> 'matched'
  ) INTO _has_exception;

  SELECT EXISTS (SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id = _invoice_id) INTO _has_any_line;

  IF NOT _has_any_line THEN
    _new_status := 'draft';
  ELSIF _has_exception THEN
    _new_status := 'exception';
  ELSE
    _new_status := 'matched';
  END IF;

  UPDATE public.vendor_invoices SET status = _new_status, updated_at = now()
   WHERE id = _invoice_id;

  RETURN _new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_match(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_invoice_match(UUID, NUMERIC, NUMERIC) TO authenticated;

CREATE INDEX idx_po_tenant ON public.purchase_orders(tenant_id, status);
CREATE INDEX idx_pol_po ON public.purchase_order_lines(po_id);
CREATE INDEX idx_grn_tenant ON public.goods_receipts(tenant_id, po_id);
CREATE INDEX idx_grnl_pol ON public.goods_receipt_lines(po_line_id);
CREATE INDEX idx_vi_tenant ON public.vendor_invoices(tenant_id, status);
CREATE INDEX idx_vil_pol ON public.vendor_invoice_lines(po_line_id);
CREATE INDEX idx_vendors_tenant ON public.vendors(tenant_id, is_active);
