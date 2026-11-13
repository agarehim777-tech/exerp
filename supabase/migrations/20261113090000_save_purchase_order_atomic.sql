-- Save a purchase order header and its lines in one transaction.
--
-- ProcurementPage wrote the header and the lines in separate requests. A failed line insert left a
-- PO without lines; on edit it first deleted every line, so a failure there emptied an existing PO.
-- SECURITY INVOKER: the caller's RLS on purchase_orders / purchase_order_lines applies exactly as
-- it did for the direct table writes.
-- Lines are replaced only while no goods receipt or vendor invoice references them; otherwise only
-- the header changes (the page already showed that notice).

CREATE OR REPLACE FUNCTION public.save_purchase_order(_tenant_id uuid, _po_id uuid, _header jsonb, _lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_po_id uuid := _po_id;
  v_has_movements boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF _tenant_id IS NULL OR jsonb_typeof(_header) IS DISTINCT FROM 'object'
     OR nullif(_header->>'vendor_id', '') IS NULL OR nullif(trim(_header->>'po_number'), '') IS NULL THEN
    RAISE EXCEPTION 'po_header_invalid';
  END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'po_lines_required';
  END IF;

  IF v_po_id IS NULL THEN
    INSERT INTO public.purchase_orders (tenant_id, vendor_id, po_number, order_date, expected_date, currency,
      factory_name, exchange_rate, payment_terms, notes, created_by, status)
    VALUES (_tenant_id, (_header->>'vendor_id')::uuid, trim(_header->>'po_number'),
      coalesce(nullif(_header->>'order_date', '')::date, current_date), nullif(_header->>'expected_date', '')::date,
      coalesce(nullif(_header->>'currency', ''), 'AZN'), nullif(trim(_header->>'factory_name'), ''),
      coalesce(nullif(_header->>'exchange_rate', '')::numeric, 1), nullif(trim(_header->>'payment_terms'), ''),
      nullif(trim(_header->>'notes'), ''), auth.uid(), 'draft')
    RETURNING id INTO v_po_id;
  ELSE
    UPDATE public.purchase_orders SET
      vendor_id = (_header->>'vendor_id')::uuid,
      po_number = trim(_header->>'po_number'),
      order_date = coalesce(nullif(_header->>'order_date', '')::date, order_date),
      expected_date = nullif(_header->>'expected_date', '')::date,
      currency = coalesce(nullif(_header->>'currency', ''), currency),
      factory_name = nullif(trim(_header->>'factory_name'), ''),
      exchange_rate = coalesce(nullif(_header->>'exchange_rate', '')::numeric, exchange_rate),
      payment_terms = nullif(trim(_header->>'payment_terms'), ''),
      notes = nullif(trim(_header->>'notes'), ''),
      updated_at = now()
    WHERE id = v_po_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'po_not_found'; END IF;

    SELECT EXISTS (SELECT 1 FROM public.goods_receipt_lines r JOIN public.purchase_order_lines l ON l.id = r.po_line_id
                    WHERE l.po_id = v_po_id)
        OR EXISTS (SELECT 1 FROM public.vendor_invoice_lines i JOIN public.purchase_order_lines l ON l.id = i.po_line_id
                    WHERE l.po_id = v_po_id)
      INTO v_has_movements;
    IF v_has_movements THEN
      RETURN jsonb_build_object('po_id', v_po_id, 'lines_replaced', false);
    END IF;
    DELETE FROM public.purchase_order_lines WHERE po_id = v_po_id;
  END IF;

  INSERT INTO public.purchase_order_lines (po_id, line_no, product_sku, description, qty_ordered, unit_price,
    tax_rate, product_id, unit)
  SELECT v_po_id, item.ordinality::int, trim(item.value->>'product_sku'), nullif(trim(item.value->>'description'), ''),
    (item.value->>'qty_ordered')::numeric, (item.value->>'unit_price')::numeric,
    coalesce(nullif(item.value->>'tax_rate', '')::numeric, 0), nullif(item.value->>'product_id', '')::uuid,
    coalesce(nullif(item.value->>'unit', ''), 'ədəd')
  FROM jsonb_array_elements(_lines) WITH ORDINALITY AS item(value, ordinality);

  RETURN jsonb_build_object('po_id', v_po_id, 'lines_replaced', true);
END $$;

REVOKE ALL ON FUNCTION public.save_purchase_order(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(uuid, uuid, jsonb, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
