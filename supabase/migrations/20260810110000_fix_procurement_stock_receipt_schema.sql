-- Align landed-cost receipts with the canonical stock schema created by
-- 20260729130000_core_operations.sql. The later legacy stock migration used
-- CREATE TABLE IF NOT EXISTS and therefore its sku/move_type/qty columns do
-- not exist on installations that already have the canonical table.

DROP TRIGGER IF EXISTS trg_stock_balance ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_sm_updated ON public.stock_movements;

CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment(
  _shipment uuid,
  _warehouse uuid,
  _receipt_date date DEFAULT current_date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.procurement_shipments%rowtype;
  r uuid;
  x record;
  m uuid;
BEGIN
  SELECT * INTO s
  FROM public.procurement_shipments
  WHERE id = _shipment
  FOR UPDATE;

  IF s.id IS NULL OR NOT public.is_tenant_member(s.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = _warehouse AND tenant_id = s.tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Seçilmiş anbar aktiv deyil və ya bu şirkətə aid deyil';
  END IF;

  IF s.status <> 'costed' OR s.costing_approved_at IS NULL THEN
    RAISE EXCEPTION 'Maya hesablaması təsdiqlənməyib';
  END IF;

  IF EXISTS (SELECT 1 FROM public.procurement_receipts WHERE shipment_id = s.id) THEN
    RAISE EXCEPTION 'Göndəriş artıq anbara qəbul edilib';
  END IF;

  INSERT INTO public.procurement_receipts(
    tenant_id, receipt_no, shipment_id, warehouse_id, receipt_date, created_by
  ) VALUES (
    s.tenant_id, 'GRN-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
    s.id, _warehouse, _receipt_date, auth.uid()
  ) RETURNING id INTO r;

  FOR x IN
    SELECT sl.*, pol.product_id, pol.po_id, pol.product_sku,
           lc.unit_landed_cost, lc.landed_total
    FROM public.procurement_shipment_lines sl
    JOIN public.purchase_order_lines pol ON pol.id = sl.po_line_id
    JOIN public.procurement_landed_cost_lines lc
      ON lc.shipment_line_id = sl.id
     AND lc.costing_version = s.costing_version
     AND lc.is_approved
    WHERE sl.shipment_id = s.id
  LOOP
    IF x.product_id IS NULL THEN
      RAISE EXCEPTION 'Məhsul bağlantısı yoxdur: %', x.product_sku;
    END IF;
    IF x.received_qty IS NULL OR x.received_qty <= 0 THEN
      RAISE EXCEPTION 'Qəbul miqdarı düzgün deyil: %', x.product_sku;
    END IF;

    INSERT INTO public.stock_balances(
      tenant_id, warehouse_id, product_id, on_hand, reserved
    ) VALUES (
      s.tenant_id, _warehouse, x.product_id, x.received_qty, 0
    )
    ON CONFLICT (tenant_id, warehouse_id, product_id)
    DO UPDATE SET
      on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
      updated_at = now();

    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      unit_cost, reference_type, reference_id, note, created_by
    ) VALUES (
      s.tenant_id, _warehouse, x.product_id, 'receipt', x.received_qty,
      x.unit_landed_cost, 'procurement_receipt', r,
      s.shipment_no || ' üzrə yekun maya ilə qəbul', auth.uid()
    ) RETURNING id INTO m;

    INSERT INTO public.procurement_receipt_lines(
      receipt_id, shipment_line_id, product_id, po_line_id, lot_no,
      received_qty, unit_landed_cost, landed_total, stock_movement_id
    ) VALUES (
      r, x.id, x.product_id, x.po_line_id, x.lot_no,
      x.received_qty, x.unit_landed_cost, x.landed_total, m
    );
  END LOOP;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Qəbul üçün təsdiqlənmiş maya sətri yoxdur';
  END IF;

  UPDATE public.procurement_shipments
  SET status = 'received', warehouse_id = _warehouse,
      received_at = now(), received_by = auth.uid(), updated_at = now()
  WHERE id = s.id;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) TO authenticated;
