-- Sales are confirmed automatically. The obsolete preparation statuses are
-- normalized so older clients cannot reintroduce the removed workflow step.
CREATE OR REPLACE FUNCTION public.normalize_sales_order_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text IN ('draft', 'pending', 'processing', 'shipped') THEN
    NEW.status := 'confirmed'::public.order_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sales_order_status ON public.orders;
CREATE TRIGGER trg_normalize_sales_order_status
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.normalize_sales_order_status();

UPDATE public.orders
   SET status = 'confirmed'::public.order_status,
       updated_at = now()
 WHERE status::text IN ('draft', 'pending', 'processing', 'shipped');

-- Warehouse staff complete delivery from the warehouse screen. Completion
-- immediately changes the linked sales order to delivered.
CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.orders WHERE id = _order_id;
  IF _tenant IS NULL OR NOT (
    private.has_module_access(_tenant, 'delivery', 'edit')
    OR private.has_module_access(_tenant, 'warehouse', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.orders
     SET status = 'delivered'::public.order_status,
         updated_at = now()
   WHERE id = _order_id AND tenant_id = _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated, service_role;
