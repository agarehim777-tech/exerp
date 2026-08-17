CREATE OR REPLACE FUNCTION public.create_sales_order(
  _tenant_id UUID,
  _order_no TEXT,
  _customer_id UUID,
  _order_date DATE,
  _currency TEXT,
  _notes TEXT,
  _items JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  new_order_id UUID;
  item JSONB;
  subtotal_value NUMERIC(14,2) := 0;
  vat_value NUMERIC(14,2) := 0;
  line_net NUMERIC(14,2);
  line_vat NUMERIC(14,2);
  line_total_value NUMERIC(14,2);
  item_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF trim(COALESCE(_order_no, '')) = '' OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE((item->>'qty')::NUMERIC, 0) <= 0
       OR COALESCE((item->>'unit_price')::NUMERIC, 0) < 0 THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;
    line_net := round((item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2);
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    subtotal_value := subtotal_value + line_net;
    vat_value := vat_value + line_vat;
  END LOOP;

  INSERT INTO public.orders(
    tenant_id, order_no, customer_id, order_date, status, currency,
    subtotal, vat_total, total, notes, created_by
  ) VALUES (
    _tenant_id, trim(_order_no), _customer_id, COALESCE(_order_date, current_date),
    'draft', COALESCE(NULLIF(trim(_currency), ''), 'AZN'),
    subtotal_value, vat_value, subtotal_value + vat_value, _notes, auth.uid()
  ) RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_count := item_count + 1;
    line_net := round((item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2);
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    line_total_value := line_net + line_vat;

    INSERT INTO public.order_items(
      tenant_id, order_id, product_id, line_no, description, qty,
      unit_price, discount_pct, vat_rate, line_total
    ) VALUES (
      _tenant_id, new_order_id, NULLIF(item->>'product_id', '')::UUID,
      COALESCE((item->>'line_no')::INTEGER, item_count), item->>'description',
      (item->>'qty')::NUMERIC, (item->>'unit_price')::NUMERIC,
      COALESCE((item->>'discount_pct')::NUMERIC, 0),
      COALESCE((item->>'vat_rate')::NUMERIC, 0), line_total_value
    );
  END LOOP;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'sales', 'create',
    trim(_order_no) || ' sifarişi yaradıldı',
    jsonb_build_object('order_id', new_order_id, 'total', subtotal_value + vat_value)
  );

  RETURN new_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order(UUID,TEXT,UUID,DATE,TEXT,TEXT,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order(UUID,TEXT,UUID,DATE,TEXT,TEXT,JSONB) TO authenticated;