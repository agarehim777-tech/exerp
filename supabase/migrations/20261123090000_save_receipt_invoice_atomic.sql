-- Goods receipts (GRN) and vendor invoices are saved in one transaction, like save_purchase_order.
--
-- The procurement page saved the header, then (when editing) deleted the old lines, then inserted the new
-- lines in a separate request. If that last request failed (receipt quantity guard, paid-invoice guard,
-- network), the document was left without lines. The GRN path also recomputed the PO status in yet another
-- request whose error was ignored. SECURITY INVOKER: the caller's RLS policies and the existing triggers
-- (guard_purchase_receipt_quantity, guard_paid_invoice_lines, landed-cost sync, viewer boundary) still apply.

CREATE OR REPLACE FUNCTION public.save_goods_receipt(_tenant_id uuid, _grn_id uuid, _header jsonb, _lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_grn_id uuid := _grn_id;
  v_old_po uuid;
  v_po uuid;
  v_po_id uuid;
  v_total int; v_any int; v_all int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR jsonb_typeof(_header) IS DISTINCT FROM 'object'
     OR nullif(_header->>'po_id', '') IS NULL OR nullif(trim(_header->>'grn_number'), '') IS NULL THEN
    RAISE EXCEPTION 'grn_header_invalid';
  END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'grn_lines_required';
  END IF;
  v_po := (_header->>'po_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = v_po AND tenant_id = _tenant_id) THEN
    RAISE EXCEPTION 'po_not_found';
  END IF;

  IF v_grn_id IS NULL THEN
    INSERT INTO public.goods_receipts (tenant_id, po_id, grn_number, receipt_date, notes, received_by)
    VALUES (_tenant_id, v_po, trim(_header->>'grn_number'),
      coalesce(nullif(_header->>'receipt_date', '')::date, current_date), nullif(trim(_header->>'notes'), ''), auth.uid())
    RETURNING id INTO v_grn_id;
  ELSE
    SELECT po_id INTO v_old_po FROM public.goods_receipts WHERE id = v_grn_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'grn_not_found'; END IF;
    UPDATE public.goods_receipts SET
      po_id = v_po,
      grn_number = trim(_header->>'grn_number'),
      receipt_date = coalesce(nullif(_header->>'receipt_date', '')::date, receipt_date),
      notes = nullif(trim(_header->>'notes'), '')
    WHERE id = v_grn_id AND tenant_id = _tenant_id;
    DELETE FROM public.goods_receipt_lines WHERE grn_id = v_grn_id;
  END IF;

  INSERT INTO public.goods_receipt_lines (grn_id, po_line_id, qty_received, qty_rejected, unit_volume_m3)
  SELECT v_grn_id, (item->>'po_line_id')::uuid, (item->>'qty_received')::numeric,
    coalesce(nullif(item->>'qty_rejected', '')::numeric, 0), coalesce(nullif(item->>'unit_volume_m3', '')::numeric, 0)
  FROM jsonb_array_elements(_lines) AS item;

  -- PO status from accepted quantities (received - rejected) over all its receipts. Closed and cancelled
  -- orders keep their status. Both the new and, after a move, the previous PO are refreshed.
  FOR v_po_id IN SELECT DISTINCT unnest(ARRAY[v_po, v_old_po]) LOOP
    CONTINUE WHEN v_po_id IS NULL;
    SELECT count(*),
           count(*) FILTER (WHERE coalesce(acc.qty, 0) > 0),
           count(*) FILTER (WHERE coalesce(acc.qty, 0) >= l.qty_ordered)
      INTO v_total, v_any, v_all
      FROM public.purchase_order_lines l
      LEFT JOIN LATERAL (
        SELECT sum(greatest(0, r.qty_received - r.qty_rejected)) AS qty
          FROM public.goods_receipt_lines r WHERE r.po_line_id = l.id
      ) acc ON true
     WHERE l.po_id = v_po_id;
    IF v_total > 0 THEN
      UPDATE public.purchase_orders
         SET status = CASE WHEN v_all = v_total THEN 'received' WHEN v_any > 0 THEN 'partial' ELSE 'approved' END::public.po_status
       WHERE id = v_po_id AND tenant_id = _tenant_id AND status::text NOT IN ('closed', 'cancelled');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('grn_id', v_grn_id,
    'po_status', (SELECT status::text FROM public.purchase_orders WHERE id = v_po));
END $$;
REVOKE ALL ON FUNCTION public.save_goods_receipt(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_goods_receipt(uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_vendor_invoice(_tenant_id uuid, _invoice_id uuid, _header jsonb, _lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id uuid := _invoice_id;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR jsonb_typeof(_header) IS DISTINCT FROM 'object'
     OR nullif(_header->>'vendor_id', '') IS NULL OR nullif(trim(_header->>'invoice_number'), '') IS NULL THEN
    RAISE EXCEPTION 'invoice_header_invalid';
  END IF;
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'invoice_lines_required';
  END IF;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.vendor_invoices (tenant_id, vendor_id, po_id, invoice_number, invoice_date, due_date, currency,
      match_notes, created_by, status)
    VALUES (_tenant_id, (_header->>'vendor_id')::uuid, nullif(_header->>'po_id', '')::uuid, trim(_header->>'invoice_number'),
      coalesce(nullif(_header->>'invoice_date', '')::date, current_date), nullif(_header->>'due_date', '')::date,
      coalesce(nullif(_header->>'currency', ''), 'AZN'), nullif(trim(_header->>'match_notes'), ''), auth.uid(), 'draft')
    RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.vendor_invoices SET
      vendor_id = (_header->>'vendor_id')::uuid,
      po_id = nullif(_header->>'po_id', '')::uuid,
      invoice_number = trim(_header->>'invoice_number'),
      invoice_date = coalesce(nullif(_header->>'invoice_date', '')::date, invoice_date),
      due_date = nullif(_header->>'due_date', '')::date,
      currency = coalesce(nullif(_header->>'currency', ''), currency),
      match_notes = nullif(trim(_header->>'match_notes'), '')
    WHERE id = v_invoice_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
    DELETE FROM public.vendor_invoice_lines WHERE invoice_id = v_invoice_id;
  END IF;

  INSERT INTO public.vendor_invoice_lines (invoice_id, po_line_id, qty_invoiced, unit_price, tax_rate)
  SELECT v_invoice_id, nullif(item->>'po_line_id', '')::uuid, (item->>'qty_invoiced')::numeric,
    (item->>'unit_price')::numeric, coalesce(nullif(item->>'tax_rate', '')::numeric, 0)
  FROM jsonb_array_elements(_lines) AS item;

  RETURN jsonb_build_object('invoice_id', v_invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.save_vendor_invoice(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vendor_invoice(uuid, uuid, jsonb, jsonb) TO authenticated;

-- Receiving more than half of a PO line in one GRN with two or more lines failed, and so did raising a
-- quantity on an existing GRN: "Göndərilən miqdar sifariş qalığından artıq ola bilməz". The landed-cost sync
-- upserts the GRN's shipment line (INSERT ... ON CONFLICT DO UPDATE); the BEFORE INSERT guard runs with a
-- fresh NEW.id and counted the very row being updated as another shipment. A shipment has one row per PO
-- line (unique shipment_id, po_line_id), so other shipments are the rows of other shipment_ids.
CREATE OR REPLACE FUNCTION public.guard_procurement_shipment_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_ordered numeric; v_other numeric;
BEGIN
  SELECT qty_ordered INTO v_ordered FROM public.purchase_order_lines WHERE id=NEW.po_line_id;
  SELECT COALESCE(sum(shipped_qty),0) INTO v_other FROM public.procurement_shipment_lines
   WHERE po_line_id=NEW.po_line_id AND id IS DISTINCT FROM NEW.id AND shipment_id IS DISTINCT FROM NEW.shipment_id;
  IF NEW.shipped_qty<=0 OR v_other+NEW.shipped_qty>v_ordered+0.000001 THEN
    RAISE EXCEPTION 'Göndərilən miqdar sifariş qalığından artıq ola bilməz';
  END IF;
  IF NEW.received_qty<0 OR NEW.received_qty>NEW.shipped_qty THEN
    RAISE EXCEPTION 'Qəbul miqdarı göndərilən miqdardan artıq ola bilməz';
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
