CREATE OR REPLACE FUNCTION public.customer_sales_metrics(_tenant uuid)
RETURNS TABLE(customer_id uuid,paid_total numeric,sales_total numeric,order_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_tenant_member(_tenant,auth.uid()),false)
    OR NOT coalesce(private.has_module_access(_tenant,'crm','view'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT o.customer_id,coalesce(sum(o.paid_amount),0),coalesce(sum(o.total),0),count(*)
    FROM public.orders o WHERE o.tenant_id=_tenant AND o.customer_id IS NOT NULL AND o.status::text<>'cancelled'
    GROUP BY o.customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_sales_metrics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_sales_metrics(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
