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