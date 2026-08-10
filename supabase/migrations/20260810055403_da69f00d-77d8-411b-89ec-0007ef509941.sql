CREATE OR REPLACE FUNCTION public.guard_purchase_receipt_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ordered numeric;
  v_other_accepted numeric;
BEGIN
  IF NEW.qty_received < 0 OR NEW.qty_rejected < 0 OR NEW.qty_rejected > NEW.qty_received THEN
    RAISE EXCEPTION 'Rədd miqdarı qəbul miqdarından çox ola bilməz';
  END IF;

  SELECT qty_ordered INTO v_ordered
  FROM public.purchase_order_lines
  WHERE id = NEW.po_line_id;

  SELECT COALESCE(sum(qty_received - qty_rejected), 0) INTO v_other_accepted
  FROM public.goods_receipt_lines
  WHERE po_line_id = NEW.po_line_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_other_accepted + (NEW.qty_received - NEW.qty_rejected) > v_ordered + 0.000001 THEN
    RAISE EXCEPTION 'Qəbul miqdarı sifariş qalığından artıq ola bilməz';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_receipt_quantity_trg ON public.goods_receipt_lines;
CREATE TRIGGER guard_purchase_receipt_quantity_trg
BEFORE INSERT OR UPDATE OF po_line_id, qty_received, qty_rejected
ON public.goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_receipt_quantity();

CREATE OR REPLACE FUNCTION public.guard_procurement_shipment_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_ordered numeric; v_other numeric;
BEGIN
  SELECT qty_ordered INTO v_ordered FROM public.purchase_order_lines WHERE id=NEW.po_line_id;
  SELECT COALESCE(sum(shipped_qty),0) INTO v_other FROM public.procurement_shipment_lines
   WHERE po_line_id=NEW.po_line_id AND id IS DISTINCT FROM NEW.id;
  IF NEW.shipped_qty<=0 OR v_other+NEW.shipped_qty>v_ordered+0.000001 THEN
    RAISE EXCEPTION 'Göndərilən miqdar sifariş qalığından artıq ola bilməz';
  END IF;
  IF NEW.received_qty<0 OR NEW.received_qty>NEW.shipped_qty THEN
    RAISE EXCEPTION 'Qəbul miqdarı göndərilən miqdardan artıq ola bilməz';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_procurement_shipment_quantity_trg ON public.procurement_shipment_lines;
CREATE TRIGGER guard_procurement_shipment_quantity_trg BEFORE INSERT OR UPDATE OF po_line_id,shipped_qty,received_qty
ON public.procurement_shipment_lines FOR EACH ROW EXECUTE FUNCTION public.guard_procurement_shipment_quantity();

CREATE OR REPLACE FUNCTION public.recalculate_shipment_landed_cost(_shipment uuid, _approve boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE shipment_row public.procurement_shipments%rowtype; cost_row record; line_row record; next_version integer; total_basis numeric; allocated numeric; remainder numeric; largest_line uuid;
BEGIN
 SELECT * INTO shipment_row FROM public.procurement_shipments WHERE id=_shipment FOR UPDATE;
 IF shipment_row.id IS NULL OR NOT public.is_tenant_member(shipment_row.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF shipment_row.status IN ('received','closed','cancelled') THEN RAISE EXCEPTION 'Göndəriş dəyişdirilə bilməz'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id) THEN RAISE EXCEPTION 'Göndərişdə məhsul yoxdur'; END IF;
 next_version:=shipment_row.costing_version+1;
 DELETE FROM public.procurement_cost_allocations WHERE shipment_id=shipment_row.id AND costing_version=next_version;
 DELETE FROM public.procurement_landed_cost_lines WHERE shipment_id=shipment_row.id AND costing_version=next_version;
 FOR cost_row IN SELECT * FROM public.procurement_shipment_costs WHERE shipment_id=shipment_row.id LOOP
   IF cost_row.allocation_method='direct' THEN
     IF cost_row.direct_shipment_line_id IS NULL THEN RAISE EXCEPTION 'Birbaşa xərc üçün məhsul seçilməyib'; END IF;
     INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(shipment_row.tenant_id,shipment_row.id,cost_row.direct_shipment_line_id,cost_row.id,next_version,1,1,cost_row.amount_base);
   ELSIF cost_row.allocation_method='manual' THEN
     allocated:=0;
     FOR line_row IN SELECT * FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id LOOP
       remainder:=coalesce((cost_row.manual_allocations->>line_row.id::text)::numeric,0); allocated:=allocated+remainder;
       INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(shipment_row.tenant_id,shipment_row.id,line_row.id,cost_row.id,next_version,remainder,CASE WHEN cost_row.amount_base=0 THEN 0 ELSE remainder/cost_row.amount_base END,remainder);
     END LOOP;
     IF round(allocated,6)<>round(cost_row.amount_base,6) THEN RAISE EXCEPTION 'Əl bölgüsünün cəmi xərc məbləğinə bərabər deyil'; END IF;
   ELSE
     SELECT sum(CASE cost_row.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty WHEN 'equal' THEN 1 ELSE 0 END) INTO total_basis FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id;
     IF coalesce(total_basis,0)=0 THEN RAISE EXCEPTION 'Bölüşdürmə bazası sıfırdır: %',cost_row.allocation_method; END IF;
     SELECT id INTO largest_line FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id ORDER BY (CASE cost_row.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty ELSE 1 END) DESC,id LIMIT 1;
     allocated:=0;
     FOR line_row IN SELECT *,CASE cost_row.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty WHEN 'equal' THEN 1 END basis FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id LOOP
       remainder:=round(cost_row.amount_base*(line_row.basis/total_basis),6); allocated:=allocated+remainder;
       INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(shipment_row.tenant_id,shipment_row.id,line_row.id,cost_row.id,next_version,line_row.basis,line_row.basis/total_basis,remainder);
     END LOOP;
     UPDATE public.procurement_cost_allocations SET allocated_amount=allocated_amount+(cost_row.amount_base-allocated) WHERE shipment_cost_id=cost_row.id AND shipment_line_id=largest_line AND costing_version=next_version;
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.procurement_shipment_lines WHERE shipment_id=shipment_row.id AND received_qty<=0) THEN RAISE EXCEPTION 'Faktiki qəbul miqdarı daxil edilməyib'; END IF;
 INSERT INTO public.procurement_landed_cost_lines(tenant_id,shipment_id,shipment_line_id,costing_version,invoice_amount,customs_amount,freight_amount,other_amount,landed_total,unit_landed_cost,is_approved)
 SELECT shipment_row.tenant_id,shipment_row.id,sl.id,next_version,sl.invoice_amount_base,
 coalesce(sum(a.allocated_amount) FILTER(WHERE pc.cost_type IN('customs_duty','customs_clearance','broker')),0)+(sl.invoice_amount_base*sl.duty_rate),
 coalesce(sum(a.allocated_amount) FILTER(WHERE pc.cost_type IN('international_freight','local_freight')),0),
 coalesce(sum(a.allocated_amount) FILTER(WHERE pc.cost_type NOT IN('customs_duty','customs_clearance','broker','international_freight','local_freight')),0),
 sl.invoice_amount_base+coalesce(sum(a.allocated_amount),0)+(sl.invoice_amount_base*sl.duty_rate),
 (sl.invoice_amount_base+coalesce(sum(a.allocated_amount),0)+(sl.invoice_amount_base*sl.duty_rate))/NULLIF(sl.received_qty,0),_approve
 FROM public.procurement_shipment_lines sl LEFT JOIN public.procurement_cost_allocations a ON a.shipment_line_id=sl.id AND a.costing_version=next_version LEFT JOIN public.procurement_shipment_costs pc ON pc.id=a.shipment_cost_id
 WHERE sl.shipment_id=shipment_row.id GROUP BY sl.id;
 UPDATE public.procurement_shipments SET costing_version=next_version,status=CASE WHEN _approve THEN 'costed' ELSE 'costing' END,costing_approved_at=CASE WHEN _approve THEN now() ELSE NULL END,costing_approved_by=CASE WHEN _approve THEN auth.uid() ELSE NULL END,updated_at=now() WHERE id=shipment_row.id;
 RETURN next_version;
END $$;

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