-- Report RPCs the reports page calls (src/shared/hooks/useReportTotals.ts): report_totals,
-- report_monthly_trend, report_risk_rows, report_module_summary. Lovable added them only as
-- drizzle/migrations 0018-0022, so a database built from supabase/migrations (CI, restore drill)
-- answered PGRST202. Ported unchanged and in order; 0021/0022 redefine report_module_summary.

-- ---- drizzle/migrations/0018_report_totals_rpc.sql ----
CREATE OR REPLACE FUNCTION public.report_totals(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT jsonb_build_object(
    'revenue', coalesce((SELECT sum(o.total) FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
        AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to)),0),
    'order_count', (SELECT count(*) FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
        AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to)),
    'active_customers', (SELECT count(DISTINCT o.customer_id) FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
        AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to)),
    'operating_expense', coalesce((SELECT sum(e.amount) FROM public.expenses e WHERE e.tenant_id=_tenant_id
        AND e.status NOT IN ('cancelled','rejected')
        AND (_from IS NULL OR e.expense_date>=_from) AND (_to IS NULL OR e.expense_date<=_to)),0),
    'production_cost', coalesce((SELECT sum(b.total_cost) FROM public.production_batches b WHERE b.tenant_id=_tenant_id
        AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)),0),
    'production_count', (SELECT count(*) FROM public.production_batches b WHERE b.tenant_id=_tenant_id
        AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to))
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.report_totals(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_totals(uuid,date,date) TO authenticated;

-- ---- drizzle/migrations/0019_report_trend_and_risks.sql ----
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

-- ---- drizzle/migrations/0020_report_module_summary.sql ----
CREATE OR REPLACE FUNCTION public.report_module_summary(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb; prod_risks jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Production risk: a material of a batch in the period no longer has enough sellable stock to repeat that batch.
  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO prod_risks FROM (
    SELECT DISTINCT ON (b.id) jsonb_build_object('id', b.id, 'area','İstehsalat', 'title', coalesce(p.name,'Məhsul'),
      'amount', b.total_cost, 'owner', coalesce(w.name,'Anbar'),
      'action', coalesce(mp.name,'Xammal') || ': ' || trim_scale(greatest(0, coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0)))::text || ' / ' || trim_scale(m.quantity)::text,
      'priority','Yüksək','status','Xammal riski') r
    FROM public.production_batches b
    JOIN public.production_batch_materials m ON m.batch_id=b.id
    LEFT JOIN public.products p ON p.id=b.product_id
    LEFT JOIN public.products mp ON mp.id=m.product_id
    LEFT JOIN public.warehouses w ON w.id=b.warehouse_id
    LEFT JOIN public.stock_balances sb ON sb.tenant_id=b.tenant_id AND sb.warehouse_id=b.warehouse_id AND sb.product_id=m.product_id
    WHERE b.tenant_id=_tenant_id
      AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)
      AND coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0) < m.quantity
    ORDER BY b.id, m.quantity DESC
    LIMIT 20
  ) x;

  WITH o AS (
    SELECT count(*) n, coalesce(sum(total),0) revenue,
      count(*) FILTER (WHERE status::text NOT IN ('delivered')) open_deliveries
    FROM public.orders WHERE tenant_id=_tenant_id AND status::text<>'cancelled'
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), c AS (
    SELECT count(*) n,
      coalesce(sum((SELECT sum(greatest(0,i.principal_due-i.principal_paid)) FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived'))),0) balance,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived') AND i.due_date<current_date)) overdue
    FROM public.credit_contracts cc WHERE cc.tenant_id=_tenant_id AND cc.status NOT IN ('cancelled')
  ), s AS (
    SELECT coalesce(sum(sb.on_hand),0) total_qty, coalesce(sum(sb.on_hand-sb.reserved-sb.problem_qty),0) sellable,
      count(*) FILTER (WHERE greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))>0
        AND sb.on_hand-sb.reserved-sb.problem_qty <= greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))) low
    FROM public.stock_balances sb JOIN public.products p ON p.id=sb.product_id AND p.is_active WHERE sb.tenant_id=_tenant_id
  ), po AS (
    SELECT count(*) n,
      count(*) FILTER (WHERE status::text IN ('draft','approved','partial')) open_n,
      coalesce(sum(CASE WHEN status::text='approved' THEN (SELECT sum(l.qty_ordered*l.unit_price*(1+coalesce(l.tax_rate,0)/100)) FROM public.purchase_order_lines l WHERE l.po_id=purchase_orders.id) END),0) approved_amount
    FROM public.purchase_orders WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), e AS (
    SELECT count(*) n, count(*) FILTER (WHERE status='pending') pending,
      coalesce(sum(amount) FILTER (WHERE status IN ('approved','paid')),0) approved_amount
    FROM public.expenses WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR expense_date>=_from) AND (_to IS NULL OR expense_date<=_to)
  ), cash AS (
    SELECT coalesce(sum(t.amount),0) inflow FROM public.cash_transactions t
    WHERE t.tenant_id=_tenant_id AND t.direction='in' AND t.reversed_at IS NULL AND t.reversal_of IS NULL
      AND t.category IS DISTINCT FROM 'transaction_reversal'
      AND (_from IS NULL OR t.occurred_at::date>=_from) AND (_to IS NULL OR t.occurred_at::date<=_to)
  ), inv AS (
    SELECT count(*) n,
      coalesce(sum(greatest(0,total-paid_amount)) FILTER (WHERE status::text<>'cancelled'),0) open_balance,
      count(*) FILTER (WHERE status::text NOT IN ('cancelled','paid') AND total-paid_amount>0 AND due_date<current_date) overdue
    FROM public.sales_invoices WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR invoice_date>=_from) AND (_to IS NULL OR invoice_date<=_to)
  ), pr AS (
    SELECT count(*) n, coalesce(sum(total_cost),0) cost FROM public.production_batches
    WHERE tenant_id=_tenant_id AND (_from IS NULL OR completed_at::date>=_from) AND (_to IS NULL OR completed_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'sales', jsonb_build_object('revenue',o.revenue,'count',o.n,'open_deliveries',o.open_deliveries),
    'credit', jsonb_build_object('balance',c.balance,'count',c.n,'overdue',c.overdue),
    'stock', jsonb_build_object('total',s.total_qty,'sellable',s.sellable,'low',s.low,
      'sku',(SELECT count(*) FROM public.products WHERE tenant_id=_tenant_id AND is_active)),
    'procurement', jsonb_build_object('approved_amount',po.approved_amount,'count',po.n,'open',po.open_n,
      'vendors',(SELECT count(*) FROM public.vendors WHERE tenant_id=_tenant_id AND is_active)),
    'finance', jsonb_build_object('cash_inflow',cash.inflow,'count',e.n,'pending',e.pending,'approved_amount',e.approved_amount),
    'invoices', jsonb_build_object('open_balance',inv.open_balance,'count',inv.n,'overdue',inv.overdue),
    'production', jsonb_build_object('cost',pr.cost,'count',pr.n,'risk',jsonb_array_length(prod_risks)),
    'production_risks', prod_risks
  ) INTO result FROM o, c, s, po, e, cash, inv, pr;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.report_module_summary(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_module_summary(uuid,date,date) TO authenticated;

-- ---- drizzle/migrations/0021_report_module_summary_cash_fix.sql ----
CREATE OR REPLACE FUNCTION public.report_module_summary(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb; prod_risks jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO prod_risks FROM (
    SELECT DISTINCT ON (b.id) jsonb_build_object('id', b.id, 'area','İstehsalat', 'title', coalesce(p.name,'Məhsul'),
      'amount', b.total_cost, 'owner', coalesce(w.name,'Anbar'),
      'action', coalesce(mp.name,'Xammal') || ': ' || trim_scale(greatest(0, coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0)))::text || ' / ' || trim_scale(m.quantity)::text,
      'priority','Yüksək','status','Xammal riski') r
    FROM public.production_batches b
    JOIN public.production_batch_materials m ON m.batch_id=b.id
    LEFT JOIN public.products p ON p.id=b.product_id
    LEFT JOIN public.products mp ON mp.id=m.product_id
    LEFT JOIN public.warehouses w ON w.id=b.warehouse_id
    LEFT JOIN public.stock_balances sb ON sb.tenant_id=b.tenant_id AND sb.warehouse_id=b.warehouse_id AND sb.product_id=m.product_id
    WHERE b.tenant_id=_tenant_id
      AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)
      AND coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0) < m.quantity
    ORDER BY b.id, m.quantity DESC
    LIMIT 20
  ) x;

  WITH o AS (
    SELECT count(*) n, coalesce(sum(total),0) revenue,
      count(*) FILTER (WHERE status::text NOT IN ('delivered')) open_deliveries
    FROM public.orders WHERE tenant_id=_tenant_id AND status::text<>'cancelled'
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), c AS (
    SELECT count(*) n,
      coalesce(sum((SELECT sum(greatest(0,i.principal_due-i.principal_paid)) FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived'))),0) balance,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived') AND i.due_date<current_date)) overdue
    FROM public.credit_contracts cc WHERE cc.tenant_id=_tenant_id AND cc.status NOT IN ('cancelled')
  ), s AS (
    SELECT coalesce(sum(sb.on_hand),0) total_qty, coalesce(sum(sb.on_hand-sb.reserved-sb.problem_qty),0) sellable,
      count(*) FILTER (WHERE greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))>0
        AND sb.on_hand-sb.reserved-sb.problem_qty <= greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))) low
    FROM public.stock_balances sb JOIN public.products p ON p.id=sb.product_id AND p.is_active WHERE sb.tenant_id=_tenant_id
  ), po AS (
    SELECT count(*) n,
      count(*) FILTER (WHERE status::text IN ('draft','approved','partial')) open_n,
      coalesce(sum(CASE WHEN status::text='approved' THEN (SELECT sum(l.qty_ordered*l.unit_price*(1+coalesce(l.tax_rate,0)/100)) FROM public.purchase_order_lines l WHERE l.po_id=purchase_orders.id) END),0) approved_amount
    FROM public.purchase_orders WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), e AS (
    SELECT count(*) n, count(*) FILTER (WHERE status='pending') pending,
      coalesce(sum(amount) FILTER (WHERE status IN ('approved','paid')),0) approved_amount
    FROM public.expenses WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR expense_date>=_from) AND (_to IS NULL OR expense_date<=_to)
  ), cash AS (
    SELECT coalesce(sum(t.amount),0) inflow FROM public.cash_transactions t
    WHERE t.tenant_id=_tenant_id AND t.direction='in' AND t.reversal_of IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of=t.id)
      AND t.category IS DISTINCT FROM 'transaction_reversal'
      AND (_from IS NULL OR t.occurred_at::date>=_from) AND (_to IS NULL OR t.occurred_at::date<=_to)
  ), inv AS (
    SELECT count(*) n,
      coalesce(sum(greatest(0,total-paid_amount)) FILTER (WHERE status::text<>'cancelled'),0) open_balance,
      count(*) FILTER (WHERE status::text NOT IN ('cancelled','paid') AND total-paid_amount>0 AND due_date<current_date) overdue
    FROM public.sales_invoices WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR invoice_date>=_from) AND (_to IS NULL OR invoice_date<=_to)
  ), pr AS (
    SELECT count(*) n, coalesce(sum(total_cost),0) cost FROM public.production_batches
    WHERE tenant_id=_tenant_id AND (_from IS NULL OR completed_at::date>=_from) AND (_to IS NULL OR completed_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'sales', jsonb_build_object('revenue',o.revenue,'count',o.n,'open_deliveries',o.open_deliveries),
    'credit', jsonb_build_object('balance',c.balance,'count',c.n,'overdue',c.overdue),
    'stock', jsonb_build_object('total',s.total_qty,'sellable',s.sellable,'low',s.low,
      'sku',(SELECT count(*) FROM public.products WHERE tenant_id=_tenant_id AND is_active)),
    'procurement', jsonb_build_object('approved_amount',po.approved_amount,'count',po.n,'open',po.open_n,
      'vendors',(SELECT count(*) FROM public.vendors WHERE tenant_id=_tenant_id AND is_active)),
    'finance', jsonb_build_object('cash_inflow',cash.inflow,'count',e.n,'pending',e.pending,'approved_amount',e.approved_amount),
    'invoices', jsonb_build_object('open_balance',inv.open_balance,'count',inv.n,'overdue',inv.overdue),
    'production', jsonb_build_object('cost',pr.cost,'count',pr.n,'risk',jsonb_array_length(prod_risks)),
    'production_risks', prod_risks
  ) INTO result FROM o, c, s, po, e, cash, inv, pr;
  RETURN result;
END $$;

-- ---- drizzle/migrations/0022_report_module_summary_credit_fix.sql ----
CREATE OR REPLACE FUNCTION public.report_module_summary(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb; prod_risks jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO prod_risks FROM (
    SELECT DISTINCT ON (b.id) jsonb_build_object('id', b.id, 'area','İstehsalat', 'title', coalesce(p.name,'Məhsul'),
      'amount', b.total_cost, 'owner', coalesce(w.name,'Anbar'),
      'action', coalesce(mp.name,'Xammal') || ': ' || trim_scale(greatest(0, coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0)))::text || ' / ' || trim_scale(m.quantity)::text,
      'priority','Yüksək','status','Xammal riski') r
    FROM public.production_batches b
    JOIN public.production_batch_materials m ON m.batch_id=b.id
    LEFT JOIN public.products p ON p.id=b.product_id
    LEFT JOIN public.products mp ON mp.id=m.product_id
    LEFT JOIN public.warehouses w ON w.id=b.warehouse_id
    LEFT JOIN public.stock_balances sb ON sb.tenant_id=b.tenant_id AND sb.warehouse_id=b.warehouse_id AND sb.product_id=m.product_id
    WHERE b.tenant_id=_tenant_id
      AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)
      AND coalesce(sb.on_hand,0)-coalesce(sb.reserved,0)-coalesce(sb.problem_qty,0) < m.quantity
    ORDER BY b.id, m.quantity DESC
    LIMIT 20
  ) x;

  WITH o AS (
    SELECT count(*) n, coalesce(sum(total),0) revenue,
      count(*) FILTER (WHERE status::text NOT IN ('delivered')) open_deliveries
    FROM public.orders WHERE tenant_id=_tenant_id AND status::text<>'cancelled'
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), c AS (
    SELECT count(*) n,
      coalesce(sum(CASE WHEN EXISTS(SELECT 1 FROM public.credit_installments i WHERE i.credit_id=cc.id)
        THEN (SELECT coalesce(sum(greatest(0,i.principal_due-i.principal_paid)),0) FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived'))
        ELSE greatest(0, cc.principal - greatest(coalesce(cc.initial_payment,0), coalesce(cc.required_initial,0))) END),0) balance,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.credit_installments i WHERE i.credit_id=cc.id AND i.status NOT IN ('paid','waived') AND i.due_date<current_date)) overdue
    FROM public.credit_contracts cc WHERE cc.tenant_id=_tenant_id AND cc.status NOT IN ('cancelled','closed')
  ), s AS (
    SELECT coalesce(sum(sb.on_hand),0) total_qty, coalesce(sum(sb.on_hand-sb.reserved-sb.problem_qty),0) sellable,
      count(*) FILTER (WHERE greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))>0
        AND sb.on_hand-sb.reserved-sb.problem_qty <= greatest(coalesce(sb.minimum_level,0),coalesce(p.minimum_stock,0))) low
    FROM public.stock_balances sb JOIN public.products p ON p.id=sb.product_id AND p.is_active WHERE sb.tenant_id=_tenant_id
  ), po AS (
    SELECT count(*) n,
      count(*) FILTER (WHERE status::text IN ('draft','approved','partial')) open_n,
      coalesce(sum(CASE WHEN status::text='approved' THEN (SELECT sum(l.qty_ordered*l.unit_price*(1+coalesce(l.tax_rate,0)/100)) FROM public.purchase_order_lines l WHERE l.po_id=purchase_orders.id) END),0) approved_amount
    FROM public.purchase_orders WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR order_date>=_from) AND (_to IS NULL OR order_date<=_to)
  ), e AS (
    SELECT count(*) n, count(*) FILTER (WHERE status='pending') pending,
      coalesce(sum(amount) FILTER (WHERE status IN ('approved','paid')),0) approved_amount
    FROM public.expenses WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR expense_date>=_from) AND (_to IS NULL OR expense_date<=_to)
  ), cash AS (
    SELECT coalesce(sum(t.amount),0) inflow FROM public.cash_transactions t
    WHERE t.tenant_id=_tenant_id AND t.direction='in' AND t.reversal_of IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of=t.id)
      AND t.category IS DISTINCT FROM 'transaction_reversal'
      AND (_from IS NULL OR t.occurred_at::date>=_from) AND (_to IS NULL OR t.occurred_at::date<=_to)
  ), inv AS (
    SELECT count(*) n,
      coalesce(sum(greatest(0,total-paid_amount)) FILTER (WHERE status::text<>'cancelled'),0) open_balance,
      count(*) FILTER (WHERE status::text NOT IN ('cancelled','paid') AND total-paid_amount>0 AND due_date<current_date) overdue
    FROM public.sales_invoices WHERE tenant_id=_tenant_id
      AND (_from IS NULL OR invoice_date>=_from) AND (_to IS NULL OR invoice_date<=_to)
  ), pr AS (
    SELECT count(*) n, coalesce(sum(total_cost),0) cost FROM public.production_batches
    WHERE tenant_id=_tenant_id AND (_from IS NULL OR completed_at::date>=_from) AND (_to IS NULL OR completed_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'sales', jsonb_build_object('revenue',o.revenue,'count',o.n,'open_deliveries',o.open_deliveries),
    'credit', jsonb_build_object('balance',c.balance,'count',c.n,'overdue',c.overdue),
    'stock', jsonb_build_object('total',s.total_qty,'sellable',s.sellable,'low',s.low,
      'sku',(SELECT count(*) FROM public.products WHERE tenant_id=_tenant_id AND is_active)),
    'procurement', jsonb_build_object('approved_amount',po.approved_amount,'count',po.n,'open',po.open_n,
      'vendors',(SELECT count(*) FROM public.vendors WHERE tenant_id=_tenant_id AND is_active)),
    'finance', jsonb_build_object('cash_inflow',cash.inflow,'count',e.n,'pending',e.pending,'approved_amount',e.approved_amount),
    'invoices', jsonb_build_object('open_balance',inv.open_balance,'count',inv.n,'overdue',inv.overdue),
    'production', jsonb_build_object('cost',pr.cost,'count',pr.n,'risk',jsonb_array_length(prod_risks)),
    'production_risks', prod_risks
  ) INTO result FROM o, c, s, po, e, cash, inv, pr;
  RETURN result;
END $$;

