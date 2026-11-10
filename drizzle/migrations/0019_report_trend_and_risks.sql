CREATE OR REPLACE FUNCTION public.report_monthly_trend(_tenant_id uuid, _anchor date DEFAULT current_date, _months integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE start_month date; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  start_month := (date_trunc('month', coalesce(_anchor,current_date)) - make_interval(months => greatest(1,least(_months,24)) - 1))::date;
  SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(m,'YYYY-MM-DD'), 'revenue', rev, 'expense', exp) ORDER BY m),'[]'::jsonb)
  INTO result
  FROM (
    SELECT m::date m,
      coalesce((SELECT sum(o.total) FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
        AND o.order_date >= m AND o.order_date < m + interval '1 month'),0) rev,
      coalesce((SELECT sum(e.amount) FROM public.expenses e WHERE e.tenant_id=_tenant_id AND e.status NOT IN ('cancelled','rejected')
        AND e.expense_date >= m AND e.expense_date < m + interval '1 month'),0) exp
    FROM generate_series(start_month, date_trunc('month', coalesce(_anchor,current_date)), interval '1 month') m
  ) t;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.report_risk_rows(_tenant_id uuid, _limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE lim integer := greatest(1, least(coalesce(_limit,8), 50)); result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  WITH credit_risk AS (
    SELECT DISTINCT ON (c.id) jsonb_build_object('id', c.id, 'area','Kredit', 'title', coalesce(cu.name,'Müştəri'),
      'amount', greatest(0, i.principal_due + i.penalty_due - i.principal_paid - i.penalty_paid),
      'owner', c.contract_no,
      'action', CASE WHEN i.due_date < current_date THEN (current_date - i.due_date)::text || ' gün gecikib' ELSE 'Bu gün ödəniş' END,
      'priority', CASE WHEN i.due_date < current_date THEN 'Yüksək' ELSE 'Orta' END,
      'status', CASE WHEN i.due_date < current_date THEN 'Gecikmə' ELSE 'Bu gün' END) r, i.due_date d
    FROM public.credit_installments i JOIN public.credit_contracts c ON c.id=i.credit_id
    LEFT JOIN public.customers cu ON cu.id=c.customer_id
    WHERE i.tenant_id=_tenant_id AND c.status NOT IN ('closed','cancelled') AND i.status NOT IN ('paid','waived')
      AND i.due_date <= current_date
    ORDER BY c.id, i.due_date
  ), order_risk AS (
    SELECT jsonb_build_object('id',o.id,'area','Satış/Təhvil','title',coalesce(cu.name,'Müştəri'),
      'amount', greatest(0, o.total - coalesce(o.paid_amount,0)), 'owner', o.order_no,
      'action', (SELECT coalesce(string_agg(coalesce(p.name, oi.description, '') || ' × ' || trim_scale(oi.qty)::text, ', '),'') FROM public.order_items oi LEFT JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=o.id),
      'priority','Orta','status','Təhvil gözləyir') r
    FROM public.orders o LEFT JOIN public.customers cu ON cu.id=o.customer_id
    WHERE o.tenant_id=_tenant_id AND o.status::text NOT IN ('delivered','cancelled')
    ORDER BY o.order_date DESC, o.id LIMIT lim
  ), stock_risk AS (
    SELECT jsonb_build_object('id', sb.warehouse_id::text || '-' || sb.product_id::text, 'area','Anbar', 'title', p.name,
      'amount', greatest(0, sb.on_hand - sb.reserved - sb.problem_qty) * coalesce(p.price,0),
      'owner', coalesce(w.name,'Anbar'),
      'action', trim_scale(sb.on_hand - sb.reserved - sb.problem_qty)::text || ' qalıq / min ' || trim_scale(greatest(coalesce(sb.minimum_level,0), coalesce(p.minimum_stock,0)))::text,
      'priority', CASE WHEN sb.on_hand - sb.reserved - sb.problem_qty <= 0 THEN 'Yüksək' ELSE 'Orta' END,
      'status','Minimum qalıq') r
    FROM public.stock_balances sb JOIN public.products p ON p.id=sb.product_id AND p.is_active
    LEFT JOIN public.warehouses w ON w.id=sb.warehouse_id
    WHERE sb.tenant_id=_tenant_id
      AND greatest(coalesce(sb.minimum_level,0), coalesce(p.minimum_stock,0)) > 0
      AND sb.on_hand - sb.reserved - sb.problem_qty <= greatest(coalesce(sb.minimum_level,0), coalesce(p.minimum_stock,0))
    ORDER BY sb.on_hand - sb.reserved - sb.problem_qty, p.name LIMIT 10
  ), po_risk AS (
    SELECT jsonb_build_object('id',po.id,'area','Vendor / PO',
      'title', coalesce((SELECT string_agg(coalesce(l.description,l.product_sku),', ') FROM public.purchase_order_lines l WHERE l.po_id=po.id),'Məhsul qeyd edilməyib'),
      'amount', coalesce((SELECT sum(l.qty_ordered*l.unit_price*(1+coalesce(l.tax_rate,0)/100)) FROM public.purchase_order_lines l WHERE l.po_id=po.id),0),
      'owner', coalesce(v.name,'Vendor'),
      'action', trim_scale(coalesce((SELECT sum(l.qty_ordered) FROM public.purchase_order_lines l WHERE l.po_id=po.id),0))::text || ' ədəd sifariş',
      'priority', CASE WHEN po.status::text='draft' THEN 'Orta' ELSE 'Aşağı' END,
      'status', CASE po.status::text WHEN 'draft' THEN 'Qaralama' WHEN 'approved' THEN 'Təsdiqlənib' ELSE 'Qismən qəbul' END) r
    FROM public.purchase_orders po LEFT JOIN public.vendors v ON v.id=po.vendor_id
    WHERE po.tenant_id=_tenant_id AND po.status::text IN ('draft','approved','partial')
    ORDER BY po.order_date DESC, po.id LIMIT lim
  ), expense_risk AS (
    SELECT jsonb_build_object('id',e.id,'area','Maliyyə','title',coalesce(e.description,e.expense_no),'amount',e.amount,
      'owner',e.category,'action','Təsdiq lazımdır','priority',CASE WHEN e.amount>=5000 THEN 'Yüksək' ELSE 'Orta' END,
      'status','Təsdiq gözləyir') r
    FROM public.expenses e WHERE e.tenant_id=_tenant_id AND e.status='pending'
    ORDER BY e.expense_date DESC, e.id LIMIT lim
  ), invoice_risk AS (
    SELECT jsonb_build_object('id',si.id,'area','Faktura','title',coalesce(cu.name,'Müştəri'),
      'amount', si.total - si.paid_amount, 'owner', si.invoice_no,
      'action', CASE WHEN si.due_date IS NULL OR si.due_date >= current_date THEN 'Vaxtında'
                     WHEN current_date - si.due_date <= 30 THEN '1-30 gün' WHEN current_date - si.due_date <= 60 THEN '31-60 gün' ELSE '60+ gün' END,
      'priority', CASE WHEN si.due_date < current_date - 30 THEN 'Yüksək' ELSE 'Orta' END,
      'status', si.status::text) r
    FROM public.sales_invoices si LEFT JOIN public.customers cu ON cu.id=si.customer_id
    WHERE si.tenant_id=_tenant_id AND si.status::text NOT IN ('cancelled','paid') AND si.total - si.paid_amount > 0
    ORDER BY si.due_date NULLS LAST, si.id LIMIT lim
  )
  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO result FROM (
    SELECT r FROM (SELECT r FROM credit_risk ORDER BY d LIMIT 50) c
    UNION ALL SELECT r FROM order_risk UNION ALL SELECT r FROM stock_risk
    UNION ALL SELECT r FROM po_risk UNION ALL SELECT r FROM expense_risk UNION ALL SELECT r FROM invoice_risk
  ) all_rows;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.report_monthly_trend(uuid,date,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_risk_rows(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_monthly_trend(uuid,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_risk_rows(uuid,integer) TO authenticated;