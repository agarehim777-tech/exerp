ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS unit_volume_m3 numeric(18,6) NOT NULL DEFAULT 0
  CHECK (unit_volume_m3 >= 0);

CREATE OR REPLACE FUNCTION public.sync_grn_landed_cost_shipment(_grn uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  g public.goods_receipts%rowtype;
  p public.purchase_orders%rowtype;
  v_shipment_id uuid;
  shipment_status text;
BEGIN
  SELECT * INTO g FROM public.goods_receipts WHERE id=_grn;
  IF g.id IS NULL THEN RETURN NULL; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(g.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  SELECT * INTO p FROM public.purchase_orders WHERE id=g.po_id;
  SELECT ps.id,ps.status INTO v_shipment_id,shipment_status FROM public.procurement_shipments ps WHERE ps.source_grn_id=g.id FOR UPDATE;
  IF shipment_status IN('received','closed') THEN RAISE EXCEPTION 'Tamamlanmış mədaxil dəyişdirilə bilməz'; END IF;

  IF v_shipment_id IS NULL THEN
    INSERT INTO public.procurement_shipments(tenant_id,shipment_no,shipment_date,expected_arrival_date,currency,status,notes,source_grn_id,created_by)
    VALUES(g.tenant_id,'SHP-'||regexp_replace(g.grn_number,'^GRN-',''),g.receipt_date,p.expected_date,coalesce(p.currency,'AZN'),'draft',concat_ws(' · ',g.grn_number,g.notes),g.id,coalesce(g.received_by,auth.uid()))
    RETURNING id INTO v_shipment_id;
  ELSE
    UPDATE public.procurement_shipments SET shipment_date=g.receipt_date,expected_arrival_date=p.expected_date,currency=coalesce(p.currency,'AZN'),notes=concat_ws(' · ',g.grn_number,g.notes),updated_at=now() WHERE id=v_shipment_id;
  END IF;

  DELETE FROM public.procurement_shipment_lines sl WHERE sl.shipment_id=v_shipment_id AND NOT EXISTS(
    SELECT 1 FROM public.goods_receipt_lines gl WHERE gl.grn_id=g.id AND gl.po_line_id=sl.po_line_id AND (gl.qty_received-gl.qty_rejected)>0
  );

  WITH receipt_totals AS (
    SELECT pol.id po_line_id,sum(gl.qty_received-gl.qty_rejected) net_qty,
      coalesce(pol.unit_price,0) unit_price,
      CASE WHEN sum(gl.qty_received-gl.qty_rejected)>0 THEN
        sum((gl.qty_received-gl.qty_rejected)*gl.unit_volume_m3)/sum(gl.qty_received-gl.qty_rejected)
      ELSE 0 END unit_volume,
      coalesce(pol.duty_rate,0) duty_rate,pol.qty_ordered
    FROM public.goods_receipt_lines gl JOIN public.purchase_order_lines pol ON pol.id=gl.po_line_id
    WHERE gl.grn_id=g.id AND (gl.qty_received-gl.qty_rejected)>0
    GROUP BY pol.id,pol.unit_price,pol.duty_rate,pol.qty_ordered
  ), available_lines AS (
    SELECT rt.*,greatest(0,least(rt.net_qty,rt.qty_ordered-coalesce((SELECT sum(sl.shipped_qty) FROM public.procurement_shipment_lines sl WHERE sl.po_line_id=rt.po_line_id AND sl.shipment_id<>v_shipment_id),0))) sync_qty
    FROM receipt_totals rt
  )
  INSERT INTO public.procurement_shipment_lines(tenant_id,shipment_id,po_line_id,shipped_qty,received_qty,invoice_unit_price,exchange_rate,total_volume_m3,total_weight_kg,duty_rate)
  SELECT g.tenant_id,v_shipment_id,al.po_line_id,al.sync_qty,al.sync_qty,al.unit_price,coalesce(p.exchange_rate,1),al.sync_qty*al.unit_volume,0,al.duty_rate
  FROM available_lines al WHERE al.sync_qty>0
  ON CONFLICT(shipment_id,po_line_id) DO UPDATE SET shipped_qty=EXCLUDED.shipped_qty,received_qty=EXCLUDED.received_qty,invoice_unit_price=EXCLUDED.invoice_unit_price,exchange_rate=EXCLUDED.exchange_rate,total_volume_m3=EXCLUDED.total_volume_m3,total_weight_kg=0,duty_rate=EXCLUDED.duty_rate,updated_at=now();

  RETURN v_shipment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.sync_grn_landed_cost_shipment(uuid) TO authenticated;
