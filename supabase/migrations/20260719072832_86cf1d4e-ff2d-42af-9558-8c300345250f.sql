
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

  new_no := public.generate_doc_number(q.tenant_id, 'SO', 'orders', 'order_no');

  INSERT INTO public.orders(
    tenant_id, order_no, customer_id, status, currency,
    subtotal, discount_total, tax_total, vat_total, total, quote_id, notes, order_date
  ) VALUES (
    q.tenant_id, new_no, q.customer_id, 'draft', q.currency,
    q.subtotal, q.discount_total, q.tax_total, q.tax_total, q.total, q.id, q.notes, CURRENT_DATE
  ) RETURNING id INTO new_order_id;

  INSERT INTO public.order_items(tenant_id, order_id, product_id, description, qty, unit_price, discount_pct, tax_rate, vat_rate, line_total, line_no)
  SELECT q.tenant_id, new_order_id, qi.product_id, qi.description, qi.qty, qi.unit_price, qi.discount_pct, qi.tax_rate, qi.tax_rate, qi.line_total, qi.sort_order + 1
  FROM public.quote_items qi WHERE qi.quote_id = _quote_id;

  UPDATE public.quotes SET order_id = new_order_id, status = 'accepted' WHERE id = _quote_id;
  RETURN new_order_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_dashboard(_tenant UUID, _from DATE, _to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_tenant_member(_tenant, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'revenue', COALESCE((SELECT SUM(total) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'), 0),
    'orders_count', COALESCE((SELECT COUNT(*) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to), 0),
    'open_orders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE tenant_id = _tenant AND status::TEXT IN ('draft','pending','confirmed','processing')), 0),
    'avg_ticket', COALESCE((SELECT AVG(total) FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'), 0),
    'quotes_open', COALESCE((SELECT COUNT(*) FROM public.quotes WHERE tenant_id = _tenant AND status IN ('draft','sent')), 0),
    'quotes_won_amount', COALESCE((SELECT SUM(total) FROM public.quotes WHERE tenant_id = _tenant AND status = 'accepted' AND created_at::DATE BETWEEN _from AND _to), 0),
    'daily', COALESCE((
      SELECT jsonb_agg(row_to_json(d) ORDER BY d.day)
      FROM (
        SELECT created_at::DATE AS day, SUM(total) AS amount, COUNT(*) AS cnt
        FROM public.orders
        WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to AND status <> 'cancelled'
        GROUP BY created_at::DATE
      ) d
    ), '[]'::jsonb),
    'status_breakdown', COALESCE((
      SELECT jsonb_object_agg(status, cnt) FROM (
        SELECT status::TEXT AS status, COUNT(*) AS cnt FROM public.orders WHERE tenant_id = _tenant AND created_at::DATE BETWEEN _from AND _to GROUP BY status
      ) s
    ), '{}'::jsonb),
    'top_customers', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT c.id, c.name, SUM(o.total) AS amount, COUNT(o.id) AS orders_count
        FROM public.orders o JOIN public.customers c ON c.id = o.customer_id
        WHERE o.tenant_id = _tenant AND o.created_at::DATE BETWEEN _from AND _to AND o.status <> 'cancelled'
        GROUP BY c.id, c.name ORDER BY amount DESC LIMIT 5
      ) t
    ), '[]'::jsonb),
    'top_products', COALESCE((
      SELECT jsonb_agg(row_to_json(p)) FROM (
        SELECT pr.id, pr.name, SUM(oi.qty) AS qty, SUM(oi.line_total) AS amount
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
REVOKE EXECUTE ON FUNCTION public.sales_dashboard(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(UUID, DATE, DATE) TO authenticated;
