CREATE OR REPLACE FUNCTION private.assign_sales_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE next_number numeric;
BEGIN
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  -- Keep cancelled history in the sequence and serialize concurrent writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.tenant_id::text || ':sales-number', 0));
  IF NEW.order_no ~ '^SF-[0-9]+$' THEN
    SELECT greatest(1000, coalesce(max(substring(o.order_no FROM '^SF-([0-9]+)$')::numeric), 1000)) + 1
      INTO next_number FROM public.orders o
      WHERE o.tenant_id = NEW.tenant_id AND o.order_no ~ '^SF-[0-9]+$';
    NEW.order_no := 'SF-' || next_number::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assign_sales_order_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS assign_sales_order_number ON public.orders;
CREATE TRIGGER assign_sales_order_number BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.assign_sales_order_number();
NOTIFY pgrst, 'reload schema';
