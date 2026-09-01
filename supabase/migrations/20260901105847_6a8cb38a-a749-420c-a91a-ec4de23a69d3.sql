CREATE OR REPLACE FUNCTION public.reverse_sales_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  target public.orders%rowtype;
  clean_reason text := btrim(COALESCE(_reason, ''));
BEGIN
  IF length(clean_reason) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin (ən azı 3 simvol)';
  END IF;

  SELECT * INTO target FROM public.orders WHERE id = _order_id;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;

  PERFORM public.delete_sales_order_safe(_order_id);

  INSERT INTO public.audit_events(tenant_id, module, action, entity_type, entity_id, actor_id, payload)
  VALUES (
    target.tenant_id, 'sales', 'sales_order_reversed', 'orders', target.id, auth.uid(),
    jsonb_build_object('order_no', target.order_no, 'total', target.total, 'reason', clean_reason)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_sales_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order(uuid, text) TO authenticated, service_role;