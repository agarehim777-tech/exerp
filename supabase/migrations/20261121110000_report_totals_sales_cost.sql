-- report_totals gains the cost of the sales it counts, so the reports page stops pairing company-wide server revenue
-- with a cost summed in the browser from the first page of orders at today's product prices.
--
-- sales_cost: for every non-cancelled order in the period,
--   * delivered orders: the cost booked at delivery (order_accounting_events.cogs, the FIFO/average cost of the
--     stock that actually left the warehouse);
--   * orders not delivered yet: an estimate, quantity x product cost_price, or the product's current weighted
--     average stock cost when no cost price is set.
-- sales_cost_estimated is the estimated part, so the page can say how much of the cost is not final yet.
CREATE OR REPLACE FUNCTION public.report_totals(_tenant_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE result jsonb; delivered_cost numeric; estimated_cost numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'reports','view'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT coalesce(sum(e.cogs),0) INTO delivered_cost
    FROM public.orders o
    JOIN public.order_accounting_events e ON e.order_id=o.id AND e.tenant_id=o.tenant_id AND e.event_type='delivery'
   WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
     AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to);

  SELECT coalesce(sum(i.qty * coalesce(nullif(p.cost_price,0), (
           SELECT sum(b.on_hand*b.avg_cost)/nullif(sum(b.on_hand),0)
             FROM public.stock_balances b WHERE b.tenant_id=_tenant_id AND b.product_id=i.product_id AND b.on_hand>0
         ), 0)),0) INTO estimated_cost
    FROM public.orders o
    JOIN public.order_items i ON i.order_id=o.id AND i.tenant_id=o.tenant_id
    LEFT JOIN public.products p ON p.id=i.product_id AND p.tenant_id=o.tenant_id
   WHERE o.tenant_id=_tenant_id AND o.status::text<>'cancelled'
     AND (_from IS NULL OR o.order_date>=_from) AND (_to IS NULL OR o.order_date<=_to)
     AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery');

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
        AND (_from IS NULL OR b.completed_at::date>=_from) AND (_to IS NULL OR b.completed_at::date<=_to)),
    'sales_cost', round(delivered_cost + estimated_cost, 2),
    'sales_cost_estimated', round(estimated_cost, 2)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.report_totals(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_totals(uuid,date,date) TO authenticated;

NOTIFY pgrst, 'reload schema';
