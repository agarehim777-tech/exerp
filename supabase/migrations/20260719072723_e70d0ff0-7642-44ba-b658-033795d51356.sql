
-- Enums
DO $$ BEGIN
  CREATE TYPE public.quote_status AS ENUM ('draft','sent','accepted','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM ('pending','packed','shipped','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('unpaid','partial','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- QUOTES
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  valid_until DATE,
  currency TEXT NOT NULL DEFAULT 'AZN',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_tenant" ON public.quotes FOR ALL
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE INDEX quotes_tenant_idx ON public.quotes(tenant_id, created_at DESC);
CREATE TRIGGER quotes_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_items_tenant" ON public.quote_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.is_tenant_member(q.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.is_tenant_member(q.tenant_id, auth.uid())));
CREATE INDEX quote_items_quote_idx ON public.quote_items(quote_id);

-- ORDERS extensions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(14,2) NOT NULL DEFAULT 0;

-- SHIPMENTS
CREATE TABLE public.sales_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shipment_no TEXT NOT NULL,
  status public.shipment_status NOT NULL DEFAULT 'pending',
  tracking_no TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, shipment_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_shipments TO authenticated;
GRANT ALL ON public.sales_shipments TO service_role;
ALTER TABLE public.sales_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipments_tenant" ON public.sales_shipments FOR ALL
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE INDEX shipments_order_idx ON public.sales_shipments(order_id);
CREATE TRIGGER shipments_updated BEFORE UPDATE ON public.sales_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.sales_shipments(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  qty_shipped NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_shipment_items TO authenticated;
GRANT ALL ON public.sales_shipment_items TO service_role;
ALTER TABLE public.sales_shipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipment_items_tenant" ON public.sales_shipment_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.sales_shipments s WHERE s.id = shipment_id AND public.is_tenant_member(s.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_shipments s WHERE s.id = shipment_id AND public.is_tenant_member(s.tenant_id, auth.uid())));

-- Number generator
CREATE OR REPLACE FUNCTION public.generate_doc_number(_tenant UUID, _prefix TEXT, _table TEXT, _column TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr TEXT := to_char(now(), 'YYYY');
  next_num INT;
  new_no TEXT;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(MAX(CAST(SPLIT_PART(%I, ''-'', 3) AS INT)), 0) + 1 FROM public.%I WHERE tenant_id = $1 AND %I LIKE $2',
    _column, _table, _column
  ) INTO next_num USING _tenant, _prefix || '-' || yr || '-%';
  new_no := _prefix || '-' || yr || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_no;
END $$;

-- Convert quote to order
CREATE OR REPLACE FUNCTION public.convert_quote_to_order(_quote_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q RECORD;
  new_order_id UUID;
  new_no TEXT;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = _quote_id;
  IF q IS NULL THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF NOT public.is_tenant_member(q.tenant_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF q.order_id IS NOT NULL THEN RETURN q.order_id; END IF;

  new_no := public.generate_doc_number(q.tenant_id, 'SO', 'orders', 'order_number');

  INSERT INTO public.orders(
    tenant_id, order_number, customer_id, status, currency,
    subtotal, discount_total, tax_total, total_amount, quote_id, notes
  ) VALUES (
    q.tenant_id, new_no, q.customer_id, 'pending', q.currency,
    q.subtotal, q.discount_total, q.tax_total, q.total, q.id, q.notes
  ) RETURNING id INTO new_order_id;

  INSERT INTO public.order_items(order_id, product_id, description, quantity, unit_price, discount_pct, tax_rate, line_total)
  SELECT new_order_id, qi.product_id, qi.description, qi.qty, qi.unit_price, qi.discount_pct, qi.tax_rate, qi.line_total
  FROM public.quote_items qi WHERE qi.quote_id = _quote_id;

  UPDATE public.quotes SET order_id = new_order_id, status = 'accepted' WHERE id = _quote_id;
  RETURN new_order_id;
END $$;

-- Sales dashboard RPC
CREATE OR REPLACE FUNCTION public.sales_dashboard(_tenant UUID, _from DATE, _to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_tenant_member(_tenant, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'revenue', COALESCE((SELECT SUM(total_amount) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'), 0),
    'orders_count', COALESCE((SELECT COUNT(*) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to), 0),
    'open_orders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE tenant_id = _tenant AND status IN ('pending','confirmed','processing')), 0),
    'avg_ticket', COALESCE((SELECT AVG(total_amount) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'), 0),
    'quotes_open', COALESCE((SELECT COUNT(*) FROM public.quotes WHERE tenant_id = _tenant AND status IN ('draft','sent')), 0),
    'quotes_won_amount', COALESCE((SELECT SUM(total) FROM public.quotes WHERE tenant_id = _tenant AND status = 'accepted' AND created_at::DATE BETWEEN _from AND _to), 0),
    'daily', COALESCE((
      SELECT jsonb_agg(row_to_json(d) ORDER BY d.day)
      FROM (
        SELECT created_at::DATE AS day, SUM(total_amount) AS amount, COUNT(*) AS cnt
        FROM public.orders
        WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'
        GROUP BY created_at::DATE
      ) d
    ), '[]'::jsonb),
    'status_breakdown', COALESCE((
      SELECT jsonb_object_agg(status, cnt) FROM (
        SELECT status, COUNT(*) AS cnt FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to GROUP BY status
      ) s
    ), '{}'::jsonb),
    'top_customers', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT c.id, c.name, SUM(o.total_amount) AS amount, COUNT(o.id) AS orders_count
        FROM public.orders o JOIN public.customers c ON c.id = o.customer_id
        WHERE o.tenant_id = _tenant AND o.created_at::DATE BETWEEN _from AND _to AND o.status <> 'cancelled'
        GROUP BY c.id, c.name ORDER BY amount DESC LIMIT 5
      ) t
    ), '[]'::jsonb),
    'top_products', COALESCE((
      SELECT jsonb_agg(row_to_json(p)) FROM (
        SELECT pr.id, pr.name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS amount
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        JOIN public.products pr ON pr.id = oi.product_id
        WHERE o.tenant_id = _tenant AND o.created_at::DATE BETWEEN _from AND _to AND o.status <> 'cancelled'
        GROUP BY pr.id, pr.name ORDER BY amount DESC NULLS LAST LIMIT 5
      ) p
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
