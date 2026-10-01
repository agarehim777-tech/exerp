CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment(
  _shipment uuid, _warehouse uuid, _receipt_date date DEFAULT current_date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE
  s public.procurement_shipments%rowtype;
  existing public.procurement_receipts%rowtype;
  r uuid; x record; m uuid; je uuid; total_value numeric:=0; line_count integer:=0;
BEGIN
  SELECT * INTO s FROM public.procurement_shipments WHERE id=_shipment FOR UPDATE;
  IF s.id IS NULL OR auth.uid() IS NULL OR NOT private.has_module_access(s.tenant_id,'warehouse','edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT * INTO existing FROM public.procurement_receipts WHERE shipment_id=s.id;
  IF FOUND THEN
    IF existing.warehouse_id IS DISTINCT FROM _warehouse OR existing.receipt_date IS DISTINCT FROM _receipt_date THEN
      RAISE EXCEPTION 'receipt_replay_payload_mismatch';
    END IF;
    RETURN existing.id;
  END IF;
  IF _receipt_date IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.warehouses WHERE id=_warehouse AND tenant_id=s.tenant_id AND is_active
  ) THEN RAISE EXCEPTION 'invalid_receipt_scope'; END IF;
  IF s.status<>'costed' OR s.costing_approved_at IS NULL THEN RAISE EXCEPTION 'costing_not_approved'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.procurement_shipment_lines sl
    LEFT JOIN public.purchase_order_lines pol ON pol.id=sl.po_line_id
    LEFT JOIN public.purchase_orders po ON po.id=pol.po_id
    LEFT JOIN public.products p ON p.id=pol.product_id
    LEFT JOIN public.procurement_landed_cost_lines lc ON lc.shipment_line_id=sl.id
      AND lc.shipment_id=s.id AND lc.costing_version=s.costing_version AND lc.is_approved
    WHERE sl.shipment_id=s.id AND (
      sl.tenant_id IS DISTINCT FROM s.tenant_id OR po.tenant_id IS DISTINCT FROM s.tenant_id
      OR p.tenant_id IS DISTINCT FROM s.tenant_id OR lc.tenant_id IS DISTINCT FROM s.tenant_id
      OR sl.received_qty<=0 OR lc.unit_landed_cost<0
      OR abs(sl.received_qty*lc.unit_landed_cost-lc.landed_total)>0.02
    )
  ) THEN RAISE EXCEPTION 'invalid_receipt_line'; END IF;
  PERFORM public.ensure_inventory_accounts(s.tenant_id);
  INSERT INTO public.procurement_receipts(tenant_id,receipt_no,shipment_id,warehouse_id,receipt_date,created_by)
    VALUES(s.tenant_id,'GRN-'||gen_random_uuid(),s.id,_warehouse,_receipt_date,auth.uid()) RETURNING id INTO r;
  FOR x IN SELECT sl.*,pol.product_id,lc.unit_landed_cost,lc.landed_total
    FROM public.procurement_shipment_lines sl
    JOIN public.purchase_order_lines pol ON pol.id=sl.po_line_id
    JOIN public.procurement_landed_cost_lines lc ON lc.shipment_line_id=sl.id
      AND lc.shipment_id=s.id AND lc.costing_version=s.costing_version AND lc.is_approved
    WHERE sl.shipment_id=s.id ORDER BY pol.product_id,sl.id FOR UPDATE OF sl,pol,lc
  LOOP
    m:=public.receive_stock(s.tenant_id,_warehouse,x.product_id,x.received_qty,x.unit_landed_cost,
      'procurement_receipt',r,s.shipment_no);
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,
      source_type,source_id,received_at,original_qty,remaining_qty,unit_cost)
      VALUES(s.tenant_id,_warehouse,x.product_id,m,'procurement_receipt',r,_receipt_date,
        x.received_qty,x.received_qty,x.unit_landed_cost);
    INSERT INTO public.procurement_receipt_lines(receipt_id,shipment_line_id,product_id,po_line_id,
      lot_no,received_qty,unit_landed_cost,landed_total,stock_movement_id)
      VALUES(r,x.id,x.product_id,x.po_line_id,x.lot_no,x.received_qty,x.unit_landed_cost,x.landed_total,m);
    total_value:=total_value+x.landed_total; line_count:=line_count+1;
  END LOOP;
  IF line_count=0 OR total_value<=0 THEN RAISE EXCEPTION 'approved_cost_lines_missing'; END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(s.tenant_id,_receipt_date,s.shipment_no,'Landed cost receipt','procurement_receipt',r,auth.uid())
    RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
    (je,public.gl_account_by_code(s.tenant_id,'2050'),round(total_value,2),0,'Inventory',1),
    (je,public.gl_account_by_code(s.tenant_id,'2200'),0,round(total_value,2),'Payables',2);
  UPDATE public.journal_entries SET posted=true WHERE id=je;
  UPDATE public.procurement_shipments SET status='received',warehouse_id=_warehouse,received_at=now(),
    received_by=auth.uid(),updated_at=now() WHERE id=s.id;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) TO authenticated;
