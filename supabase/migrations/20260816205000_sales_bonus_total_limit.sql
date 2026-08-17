-- A sales order may distribute at most 3% in total between all assigned
-- salespeople. Keep this rule in the database as well as the sales UI.
CREATE OR REPLACE FUNCTION public.set_order_bonus_assignments(
  _order_id uuid, _effective_from date, _allocations jsonb, _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_order public.orders%rowtype;
  item jsonb;
  item_position bigint;
  total_rate numeric := 0;
  seller text;
  seller_rate numeric;
BEGIN
  SELECT * INTO target_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target_order.id IS NULL
     OR NOT private.has_module_access(target_order.tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _effective_from IS NULL
     OR jsonb_typeof(_allocations) <> 'array'
     OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'Ən azı bir satıcı və başlanğıc tarixi daxil edilməlidir';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    seller := btrim(item->>'seller_name');
    seller_rate := COALESCE((item->>'rate')::numeric, 0);
    IF seller = '' OR seller_rate <= 0 OR seller_rate > 3 THEN
      RAISE EXCEPTION 'Satıcı və bonus faizi düzgün deyil';
    END IF;
    total_rate := total_rate + seller_rate;
  END LOOP;
  IF total_rate > 3 THEN
    RAISE EXCEPTION 'Ümumi bonus faizi 3%%-dən çox ola bilməz';
  END IF;

  UPDATE public.order_bonus_assignments
     SET effective_to = _effective_from - 1
   WHERE tenant_id = target_order.tenant_id
     AND order_id = target_order.id
     AND effective_from < _effective_from
     AND (effective_to IS NULL OR effective_to >= _effective_from);

  DELETE FROM public.order_bonus_assignments assignment
   WHERE assignment.tenant_id = target_order.tenant_id
     AND assignment.order_id = target_order.id
     AND assignment.effective_from >= _effective_from
     AND NOT EXISTS (
       SELECT 1 FROM public.sales_bonus_entries entry
        WHERE entry.assignment_id = assignment.id
     );

  FOR item, item_position IN
    SELECT value, ordinality
      FROM jsonb_array_elements(_allocations) WITH ORDINALITY
  LOOP
    INSERT INTO public.order_bonus_assignments(
      tenant_id, order_id, seller_name, rate, position,
      effective_from, reason
    ) VALUES (
      target_order.tenant_id, target_order.id, btrim(item->>'seller_name'),
      (item->>'rate')::numeric, item_position, _effective_from,
      NULLIF(btrim(_reason), '')
    );
  END LOOP;

  PERFORM public.backfill_sales_bonus_for_order(target_order.id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) TO authenticated, service_role;
