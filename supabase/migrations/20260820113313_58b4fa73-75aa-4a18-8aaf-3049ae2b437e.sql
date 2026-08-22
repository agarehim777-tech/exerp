CREATE OR REPLACE FUNCTION public.process_sales_order_status(_order_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE o public.orders%rowtype; it record; b record; l record; need numeric; take numeric; method text; mv uuid; cogs numeric:=0; je uuid; n int:=1;
 ar uuid; rev uuid; vat uuid; ia uuid; ca uuid; aa uuid; paid numeric; oldq numeric; oldc numeric;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL OR NOT private.has_module_access(o.tenant_id,'sales','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF _status NOT IN('draft','pending','confirmed','processing','shipped','delivered','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF _status='delivered' THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN UPDATE public.orders SET status='delivered' WHERE id=o.id; RETURN; END IF;
  PERFORM public.ensure_inventory_accounts(o.tenant_id); SELECT valuation_method INTO method FROM public.inventory_accounting_settings WHERE tenant_id=o.tenant_id;
  FOR it IN SELECT * FROM public.order_items WHERE order_id=o.id ORDER BY line_no FOR UPDATE LOOP
   IF it.product_id IS NULL THEN CONTINUE; END IF; need:=it.qty;
   IF method='fifo' THEN
    FOR l IN SELECT * FROM public.inventory_cost_layers WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND remaining_qty>0 ORDER BY received_at,id FOR UPDATE LOOP
     EXIT WHEN need<=0; take:=LEAST(need,l.remaining_qty); UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=l.id;
     UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=l.warehouse_id AND product_id=it.product_id AND on_hand>=take;
     IF NOT FOUND THEN RAISE EXCEPTION 'Stok və maya qatı uyğun deyil: %',it.description; END IF;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,l.warehouse_id,it.product_id,'out',take,l.unit_cost,'sales_order:'||o.id,o.order_no,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,cost_layer_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,l.warehouse_id,it.product_id,l.id,mv,take,l.unit_cost,take*l.unit_cost);
     cogs:=cogs+take*l.unit_cost; need:=need-take;
    END LOOP;
   ELSE
    FOR b IN SELECT * FROM public.stock_balances WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND on_hand>0 ORDER BY on_hand DESC,id FOR UPDATE LOOP
     EXIT WHEN need<=0; take:=LEAST(need,b.on_hand); UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE id=b.id;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,b.warehouse_id,it.product_id,'out',take,COALESCE(b.avg_cost,0),'sales_order:'||o.id,o.order_no,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,b.warehouse_id,it.product_id,mv,take,COALESCE(b.avg_cost,0),take*COALESCE(b.avg_cost,0));
     cogs:=cogs+take*COALESCE(b.avg_cost,0); need:=need-take;
    END LOOP;
   END IF;
   IF need>0.0005 THEN RAISE EXCEPTION 'Anbarda kifayət qədər məhsul yoxdur: %',COALESCE(it.description,it.product_id::text); END IF;
  END LOOP;
  UPDATE public.stock_balances sb
     SET reserved=GREATEST(0, sb.reserved - agg.q), updated_at=now()
    FROM (SELECT tenant_id,warehouse_id,product_id,SUM(quantity) q
            FROM public.stock_reservations
           WHERE order_id=o.id AND status='active'
           GROUP BY 1,2,3) agg
   WHERE sb.tenant_id=agg.tenant_id AND sb.warehouse_id=agg.warehouse_id AND sb.product_id=agg.product_id;
  UPDATE public.stock_reservations SET status='fulfilled', updated_at=now() WHERE order_id=o.id AND status='active';
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300');
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,o.order_date,o.order_no,'Satış və maya uçotu','sales_order_delivery',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ar,o.total,0,'Müştəri borcu',1),(je,rev,0,o.subtotal,'Satış gəliri',2),(je,vat,0,COALESCE(o.vat_total,0),'ƏDV',3); n:=4;
  IF cogs>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ca,round(cogs,2),0,'Satışın mayası',n),(je,ia,0,round(cogs,2),'Mal ehtiyatı',n+1); n:=n+2; END IF;
  paid:=LEAST(COALESCE(o.paid_amount,0),o.total); IF paid>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,aa,paid,0,'Avansın bağlanması',n),(je,ar,0,paid,'Ödənilmiş debitor',n+1); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'delivery',je,o.total,round(cogs,2),auth.uid()); UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=o.id;
 ELSIF _status='cancelled' AND EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='cancellation') THEN RETURN; END IF;
  FOR b IN SELECT * FROM public.sales_cost_allocations WHERE order_id=o.id AND reversed_at IS NULL FOR UPDATE LOOP
   SELECT COALESCE(on_hand,0),COALESCE(avg_cost,0) INTO oldq,oldc FROM public.stock_balances WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id FOR UPDATE;
   UPDATE public.stock_balances SET avg_cost=((COALESCE(oldq,0)*COALESCE(oldc,0))+(b.quantity*b.unit_cost))/NULLIF(COALESCE(oldq,0)+b.quantity,0),on_hand=COALESCE(oldq,0)+b.quantity,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
   IF b.cost_layer_id IS NOT NULL THEN UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty+b.quantity WHERE id=b.cost_layer_id; END IF;
   INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,b.warehouse_id,b.product_id,'in',b.quantity,b.unit_cost,'sales_return:'||o.id,o.order_no,o.order_no||' ləğv',auth.uid()); UPDATE public.sales_cost_allocations SET reversed_at=now() WHERE id=b.id;
  END LOOP;
  SELECT e.cogs INTO cogs FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery';
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300'); paid:=LEAST(COALESCE(o.paid_amount,0),o.total);
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,current_date,o.order_no||'-L','Satışın ləğvi','sales_order_cancellation',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,rev,o.subtotal,0,'Gəlirin ləğvi',1),(je,vat,COALESCE(o.vat_total,0),0,'ƏDV ləğvi',2),(je,ar,0,o.total-paid,'Debitor ləğvi',3),(je,aa,0,paid,'Geri ödəniləcək məbləğ',4);
  IF COALESCE(cogs,0)>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ia,cogs,0,'Stok qaytarması',5),(je,ca,0,cogs,'Maya ləğvi',6); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'cancellation',je,o.total,COALESCE(cogs,0),auth.uid()); UPDATE public.orders SET status='cancelled',updated_at=now() WHERE id=o.id;
 ELSE
  IF o.status='delivered' THEN RAISE EXCEPTION 'Təhvil verilmiş satış yalnız ləğv edilə bilər'; END IF; UPDATE public.orders SET status=_status,updated_at=now() WHERE id=o.id;
 END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment(_shipment uuid, _warehouse uuid, _receipt_date date DEFAULT CURRENT_DATE)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  s public.procurement_shipments%rowtype;
  r uuid;
  x record;
  m uuid;
  found_line boolean := false;
BEGIN
  SELECT * INTO s FROM public.procurement_shipments WHERE id = _shipment FOR UPDATE;

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
    found_line := true;
    IF x.product_id IS NULL THEN
      RAISE EXCEPTION 'Məhsul bağlantısı yoxdur: %', x.product_sku;
    END IF;
    IF x.received_qty IS NULL OR x.received_qty <= 0 THEN
      RAISE EXCEPTION 'Qəbul miqdarı düzgün deyil: %', x.product_sku;
    END IF;

    INSERT INTO public.stock_balances(
      tenant_id, warehouse_id, product_id, sku, on_hand, reserved, avg_cost
    ) VALUES (
      s.tenant_id, _warehouse, x.product_id, x.product_sku, x.received_qty, 0,
      COALESCE(x.unit_landed_cost, 0)
    )
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET
      on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
      updated_at = now();

    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      move_type, qty, unit_cost, reference_type, reference_id, doc_no, note, created_by
    ) VALUES (
      s.tenant_id, _warehouse, x.product_id, 'receipt', x.received_qty,
      'in', x.received_qty, COALESCE(x.unit_landed_cost, 0), 'procurement_receipt', r,
      s.shipment_no, s.shipment_no || ' üzrə yekun maya ilə qəbul', auth.uid()
    ) RETURNING id INTO m;

    INSERT INTO public.inventory_cost_layers(
      tenant_id, warehouse_id, product_id, source_movement_id, source_type, source_id,
      original_qty, remaining_qty, unit_cost
    ) VALUES (
      s.tenant_id, _warehouse, x.product_id, m, 'procurement_receipt', r,
      x.received_qty, x.received_qty, COALESCE(x.unit_landed_cost, 0)
    );

    INSERT INTO public.procurement_receipt_lines(
      receipt_id, shipment_line_id, product_id, po_line_id, lot_no,
      received_qty, unit_landed_cost, landed_total, stock_movement_id
    ) VALUES (
      r, x.id, x.product_id, x.po_line_id, x.lot_no,
      x.received_qty, x.unit_landed_cost, x.landed_total, m
    );
  END LOOP;

  IF NOT found_line THEN
    RAISE EXCEPTION 'Qəbul üçün təsdiqlənmiş maya sətri yoxdur';
  END IF;

  UPDATE public.procurement_shipments
  SET status = 'received', warehouse_id = _warehouse,
      received_at = now(), received_by = auth.uid(), updated_at = now()
  WHERE id = s.id;

  RETURN r;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _delta NUMERIC;
  _wh UUID;
  _prod UUID;
  _tenant UUID;
  _sku TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _wh := OLD.warehouse_id; _prod := OLD.product_id; _tenant := OLD.tenant_id; _sku := OLD.sku;
    _delta := CASE WHEN OLD.move_type = 'out' THEN OLD.qty ELSE -OLD.qty END;
  ELSE
    _wh := NEW.warehouse_id; _prod := NEW.product_id; _tenant := NEW.tenant_id; _sku := NEW.sku;
    _delta := CASE WHEN NEW.move_type = 'out' THEN -NEW.qty ELSE NEW.qty END;
    IF TG_OP = 'UPDATE' THEN
      _delta := _delta + CASE WHEN OLD.move_type = 'out' THEN OLD.qty ELSE -OLD.qty END;
    END IF;
  END IF;

  INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, sku, on_hand, updated_at)
  VALUES (_tenant, _wh, _prod, _sku, _delta, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

REVOKE ALL ON FUNCTION public.receive_landed_cost_shipment(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_landed_cost_shipment(uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_landed_cost_shipment(uuid, uuid, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_sales_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_sales_order_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_sales_order_status(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM anon;