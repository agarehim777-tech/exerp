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
