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