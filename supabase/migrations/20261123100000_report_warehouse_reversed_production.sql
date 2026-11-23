-- Reports: cancelled production batches no longer count, and the headline totals can be computed for one
-- warehouse on the server (Codex review of 8f96db2, findings 2 and 3).

-- The three-argument version is replaced by one with an optional warehouse; existing three-argument calls
-- keep working through the default.
DROP FUNCTION IF EXISTS public.report_totals(uuid, date, date);

-- report_totals(_tenant_id, _from, _to, _warehouse_id):
-- * cancelled production batches (reverse_material_production sets reversed_at) no longer count: a cancelled
--   batch and its corrected replacement were both added to production cost and count;
-- * an optional warehouse. The page used to fall back to its first page of orders and today's product cost
--   prices when a warehouse was selected. An order belongs to a warehouse the way the app shows it: the
--   warehouse of its delivery, otherwise of its first stock reservation. Its cost is what that warehouse booked
--   (sales_cost_allocations, not reversed) or, before delivery, an estimate (quantity x cost price, or the
--   warehouse's average stock cost). Operating expenses have no warehouse and stay company-wide.
CREATE OR REPLACE FUNCTION public.report_totals(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL,
  _warehouse_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  WITH scope AS (
    SELECT o.id, o.total, o.customer_id,
           EXISTS(SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery') delivered
      FROM public.orders o
     WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
       AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to)
       AND (_warehouse_id IS NULL OR coalesce(
             (SELECT d.warehouse_id FROM public.deliveries d WHERE d.order_id=o.id AND d.status::text<>'cancelled' ORDER BY d.created_at, d.id LIMIT 1),
             (SELECT r.warehouse_id FROM public.stock_reservations r WHERE r.order_id=o.id ORDER BY r.created_at, r.id LIMIT 1)
           )=_warehouse_id)
  ), delivered AS (
    -- Whole company: the cost booked at delivery. One warehouse: what that warehouse booked for the order.
    SELECT CASE WHEN _warehouse_id IS NULL THEN
        coalesce((SELECT sum(e.cogs) FROM scope s JOIN public.order_accounting_events e
                   ON e.order_id=s.id AND e.tenant_id=_tenant_id AND e.event_type='delivery'),0)
      ELSE
        coalesce((SELECT sum(a.total_cost) FROM scope s JOIN public.sales_cost_allocations a
                   ON a.order_id=s.id AND a.tenant_id=_tenant_id
                  WHERE s.delivered AND a.reversed_at IS NULL AND a.warehouse_id=_warehouse_id),0)
      END cost
  ), estimated AS (
    SELECT coalesce(sum(i.qty * coalesce(nullif(p.cost_price,0), (
             SELECT sum(b.on_hand*b.avg_cost)/nullif(sum(b.on_hand),0)
               FROM public.stock_balances b WHERE b.tenant_id=_tenant_id AND b.product_id=i.product_id AND b.on_hand>0
                AND (_warehouse_id IS NULL OR b.warehouse_id=_warehouse_id)
           ), 0)),0) cost
      FROM scope s
      JOIN public.order_items i ON i.order_id=s.id AND i.tenant_id=_tenant_id
      LEFT JOIN public.products p ON p.id=i.product_id AND p.tenant_id=_tenant_id
     WHERE NOT s.delivered
  ), production AS (
    SELECT coalesce(sum(b.total_cost),0) cost, count(*) n FROM public.production_batches b
     WHERE b.tenant_id=_tenant_id AND b.reversed_at IS NULL AND (_warehouse_id IS NULL OR b.warehouse_id=_warehouse_id)
       AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)
  )
  SELECT jsonb_build_object(
    'revenue', coalesce((SELECT sum(total) FROM scope),0),
    'order_count', (SELECT count(*) FROM scope),
    'active_customers', (SELECT count(DISTINCT customer_id) FROM scope),
    'operating_expense', coalesce((SELECT sum(e.amount) FROM public.expenses e WHERE e.tenant_id=_tenant_id
        AND e.status NOT IN ('cancelled','rejected')
        AND (_from IS NULL OR e.expense_date>=_from) AND (_to IS NULL OR e.expense_date<=_to)),0),
    'production_cost', production.cost,
    'production_count', production.n,
    'sales_cost', round(delivered.cost + estimated.cost, 2),
    'sales_cost_estimated', round(estimated.cost, 2),
    'warehouse_id', _warehouse_id
  ) INTO result FROM delivered, estimated, production;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.report_totals(uuid,date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_totals(uuid,date,date,uuid) TO authenticated;

-- Module summary: cancelled batches leave the production cost/count and the raw-material risk list.
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
    WHERE b.tenant_id=_tenant_id AND b.reversed_at IS NULL
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
    WHERE tenant_id=_tenant_id AND reversed_at IS NULL AND (_from IS NULL OR completed_at::date>=_from) AND (_to IS NULL OR completed_at::date<=_to)
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

NOTIFY pgrst, 'reload schema';
