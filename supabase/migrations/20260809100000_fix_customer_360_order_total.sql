CREATE OR REPLACE FUNCTION public.customer_360(_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer AND public.is_tenant_member(c.tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'customer', to_jsonb(c.*),
    'open_deals', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM public.crm_deals d WHERE d.customer_id = _customer AND d.status = 'open'), '[]'::jsonb),
    'won_amount', COALESCE((SELECT SUM(amount) FROM public.crm_deals WHERE customer_id = _customer AND status = 'won'), 0),
    'activities', COALESCE((SELECT jsonb_agg(to_jsonb(a.*)) FROM (SELECT * FROM public.crm_activities WHERE customer_id = _customer ORDER BY occurred_at DESC LIMIT 20) a), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM public.crm_tasks t WHERE t.customer_id = _customer AND NOT t.done), '[]'::jsonb),
    'orders_total', COALESCE((SELECT SUM(total) FROM public.orders WHERE customer_id = _customer), 0),
    'orders_count', COALESCE((SELECT COUNT(*) FROM public.orders WHERE customer_id = _customer), 0),
    'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name, 'color', tg.color)) FROM public.crm_customer_tags ct JOIN public.crm_tags tg ON tg.id = ct.tag_id WHERE ct.customer_id = _customer), '[]'::jsonb)
  ) INTO result FROM public.customers c WHERE c.id = _customer;
  RETURN result;
END $$;
