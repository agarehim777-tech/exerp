-- A GRN is the operational intake draft. Every GRN must have one landed-cost
-- shipment so finance can add expenses and approve cost before stock posting.

ALTER TABLE public.procurement_shipments
  ADD COLUMN IF NOT EXISTS source_grn_id uuid UNIQUE
  REFERENCES public.goods_receipts(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sync_grn_landed_cost_shipment(_grn uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.goods_receipts%rowtype;
  p public.purchase_orders%rowtype;
  shipment_id uuid;
  shipment_status text;
BEGIN
  SELECT * INTO g FROM public.goods_receipts WHERE id = _grn;
  IF g.id IS NULL THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(g.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO p FROM public.purchase_orders WHERE id = g.po_id;

  SELECT id, status INTO shipment_id, shipment_status
  FROM public.procurement_shipments
  WHERE source_grn_id = g.id
  FOR UPDATE;

  IF shipment_status IN ('received','closed') THEN
    RAISE EXCEPTION 'Tamamlanmış mədaxil dəyişdirilə bilməz';
  END IF;

  IF shipment_id IS NULL THEN
    INSERT INTO public.procurement_shipments(
      tenant_id, shipment_no, shipment_date, expected_arrival_date,
      currency, status, notes, source_grn_id, created_by
    ) VALUES (
      g.tenant_id,
      'SHP-' || regexp_replace(g.grn_number, '^GRN-', ''),
      g.receipt_date,
      p.expected_date,
      coalesce(p.currency, 'AZN'),
      'draft',
      concat_ws(' · ', g.grn_number, g.notes),
      g.id,
      coalesce(g.received_by, auth.uid())
    ) RETURNING id INTO shipment_id;
  ELSE
    UPDATE public.procurement_shipments
    SET shipment_date = g.receipt_date,
        expected_arrival_date = p.expected_date,
        currency = coalesce(p.currency, 'AZN'),
        notes = concat_ws(' · ', g.grn_number, g.notes),
        updated_at = now()
    WHERE id = shipment_id;
  END IF;

  DELETE FROM public.procurement_shipment_lines sl
  WHERE sl.shipment_id = shipment_id
    AND NOT EXISTS (
      SELECT 1 FROM public.goods_receipt_lines gl
      WHERE gl.grn_id = g.id AND gl.po_line_id = sl.po_line_id
        AND (gl.qty_received - gl.qty_rejected) > 0
    );

  INSERT INTO public.procurement_shipment_lines(
    tenant_id, shipment_id, po_line_id, shipped_qty, received_qty,
    invoice_unit_price, exchange_rate, total_volume_m3,
    total_weight_kg, duty_rate
  )
  SELECT
    g.tenant_id,
    shipment_id,
    pol.id,
    sum(gl.qty_received - gl.qty_rejected),
    sum(gl.qty_received - gl.qty_rejected),
    coalesce(pol.unit_price, 0),
    coalesce(p.exchange_rate, 1),
    sum(gl.qty_received - gl.qty_rejected) * coalesce(pol.unit_volume_m3, 0),
    sum(gl.qty_received - gl.qty_rejected) * coalesce(pol.unit_gross_weight_kg, 0),
    coalesce(pol.duty_rate, 0)
  FROM public.goods_receipt_lines gl
  JOIN public.purchase_order_lines pol ON pol.id = gl.po_line_id
  WHERE gl.grn_id = g.id
    AND (gl.qty_received - gl.qty_rejected) > 0
  GROUP BY pol.id, pol.unit_price, pol.unit_volume_m3,
           pol.unit_gross_weight_kg, pol.duty_rate
  ON CONFLICT (shipment_id, po_line_id) DO UPDATE SET
    shipped_qty = EXCLUDED.shipped_qty,
    received_qty = EXCLUDED.received_qty,
    invoice_unit_price = EXCLUDED.invoice_unit_price,
    exchange_rate = EXCLUDED.exchange_rate,
    total_volume_m3 = EXCLUDED.total_volume_m3,
    total_weight_kg = EXCLUDED.total_weight_kg,
    duty_rate = EXCLUDED.duty_rate,
    updated_at = now();

  RETURN shipment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_grn_landed_cost_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_grn_landed_cost_shipment(COALESCE(NEW.grn_id, OLD.grn_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_grn_line_to_landed_cost ON public.goods_receipt_lines;
CREATE TRIGGER sync_grn_line_to_landed_cost
AFTER INSERT OR UPDATE OR DELETE ON public.goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.sync_grn_landed_cost_trigger();

CREATE OR REPLACE FUNCTION public.sync_grn_header_landed_cost_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_grn_landed_cost_shipment(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_grn_header_to_landed_cost ON public.goods_receipts;
CREATE TRIGGER sync_grn_header_to_landed_cost
AFTER INSERT OR UPDATE OF po_id, grn_number, receipt_date, notes
ON public.goods_receipts
FOR EACH ROW EXECUTE FUNCTION public.sync_grn_header_landed_cost_trigger();

GRANT EXECUTE ON FUNCTION public.sync_grn_landed_cost_shipment(uuid) TO authenticated;

-- Backfill existing GRNs, including receipts created before this integration.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT id FROM public.goods_receipts ORDER BY created_at LOOP
    PERFORM public.sync_grn_landed_cost_shipment(item.id);
  END LOOP;
END;
$$;
