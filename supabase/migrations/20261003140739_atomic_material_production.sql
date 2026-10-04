CREATE TABLE public.production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  batch_no text NOT NULL, warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric(18,3) NOT NULL CHECK(quantity>0),
  total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0),
  valuation_method text NOT NULL, journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  created_by uuid NOT NULL REFERENCES auth.users(id), completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,batch_no)
);
CREATE TABLE public.production_batch_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.production_batches(id),
  product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric(18,3) NOT NULL CHECK(quantity>0),
  total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), stock_movement_id uuid NOT NULL REFERENCES public.stock_movements(id),
  UNIQUE(batch_id,product_id)
);
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batch_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_batches_read ON public.production_batches FOR SELECT TO authenticated
  USING(coalesce(private.has_module_access(tenant_id,'production','view'),false));
CREATE POLICY production_materials_read ON public.production_batch_materials FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.production_batches b WHERE b.id=batch_id AND coalesce(private.has_module_access(b.tenant_id,'production','view'),false)));
GRANT SELECT ON public.production_batches,public.production_batch_materials TO authenticated;
GRANT ALL ON public.production_batches,public.production_batch_materials TO service_role;
REVOKE ALL ON public.production_batches,public.production_batch_materials FROM anon;
CREATE INDEX production_batches_tenant_date_idx ON public.production_batches(tenant_id,completed_at);
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.production_batches
  FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.production_batch_materials
  FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();

CREATE FUNCTION public.post_material_production(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; material jsonb; components jsonb:=_payload->'materials';
  output_id uuid:=(_payload->>'product_id')::uuid; warehouse uuid:=(_payload->>'warehouse_id')::uuid;
  output_qty numeric:=(_payload->>'quantity')::numeric; product uuid; required_qty numeric; need numeric; take numeric;
  balance public.stock_balances%rowtype; layer public.inventory_cost_layers%rowtype; method text;
  batch uuid:=gen_random_uuid(); journal uuid; movement uuid; material_cost numeric; total_cost numeric:=0;
  allocations jsonb:='[]'; result_payload jsonb; inventory_gl uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'production','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR output_qty IS NULL OR output_qty<=0
    OR output_qty::text IN('NaN','Infinity','-Infinity') OR output_qty<>round(output_qty,3)
    OR jsonb_typeof(components) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_production_request'; END IF;
  IF jsonb_array_length(components)=0 OR jsonb_array_length(components)>100 THEN RAISE EXCEPTION 'production_materials_required'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'post_material_production',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'post_material_production' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse AND tenant_id=_tenant_id AND is_active)
    OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=output_id AND tenant_id=_tenant_id AND is_active) THEN RAISE EXCEPTION 'invalid_production_scope'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(components) m GROUP BY m->>'product_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_material'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  PERFORM public.ensure_inventory_accounts(_tenant_id);
  SELECT valuation_method INTO method FROM public.inventory_accounting_settings WHERE tenant_id=_tenant_id;
  -- Serializes new output balance creation; all material balances are then locked in product order.
  PERFORM pg_advisory_xact_lock(hashtextextended('production:'||_tenant_id::text,0));
  INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved)
    VALUES(_tenant_id,warehouse,output_id,0,0) ON CONFLICT(tenant_id,warehouse_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=warehouse
    AND (product_id=output_id OR product_id IN(SELECT (m->>'product_id')::uuid FROM jsonb_array_elements(components) m)) ORDER BY product_id FOR UPDATE;
  FOR material IN SELECT value FROM jsonb_array_elements(components) ORDER BY value->>'product_id' LOOP
    product:=(material->>'product_id')::uuid; required_qty:=(material->>'quantity')::numeric;
    IF product=output_id OR required_qty IS NULL OR required_qty<=0 OR required_qty::text IN('NaN','Infinity','-Infinity')
      OR required_qty<>round(required_qty,3) OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=product AND tenant_id=_tenant_id AND is_active)
      THEN RAISE EXCEPTION 'invalid_production_material'; END IF;
    SELECT * INTO balance FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=warehouse AND product_id=product FOR UPDATE;
    IF NOT FOUND OR balance.on_hand-balance.reserved-coalesce(balance.problem_qty,0)<required_qty THEN RAISE EXCEPTION 'insufficient_material_stock'; END IF;
    material_cost:=0;
    IF method='fifo' THEN
      need:=required_qty;
      FOR layer IN SELECT * FROM public.inventory_cost_layers WHERE tenant_id=_tenant_id AND warehouse_id=warehouse
        AND product_id=product AND remaining_qty>0 ORDER BY received_at,id FOR UPDATE LOOP
        EXIT WHEN need<=0;
        take:=least(need,layer.remaining_qty); material_cost:=material_cost+take*layer.unit_cost;
        UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=layer.id;
        need:=need-take;
      END LOOP;
      IF need>0 THEN RAISE EXCEPTION 'material_cost_layers_require_reconciliation'; END IF;
    ELSE material_cost:=required_qty*balance.avg_cost;
    END IF;
    UPDATE public.stock_balances SET on_hand=on_hand-required_qty,updated_at=now()
      WHERE tenant_id=_tenant_id AND warehouse_id=warehouse AND product_id=product;
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(_tenant_id,warehouse,product,'write_off',-required_qty,round(material_cost/required_qty,6),'production_batch',batch,'BOM material consumption',auth.uid()) RETURNING id INTO movement;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('product_id',product,'quantity',required_qty,'total_cost',material_cost,'movement_id',movement));
    total_cost:=total_cost+material_cost;
  END LOOP;
  IF round(total_cost,2)<=0 THEN RAISE EXCEPTION 'production_material_valuation_required'; END IF;
  PERFORM public.receive_stock(_tenant_id,warehouse,output_id,output_qty,round(total_cost/output_qty,6),'production_batch',batch,'Finished goods');
  inventory_gl:=public.gl_account_by_code(_tenant_id,'2050');
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,current_date,'PROD-'||batch::text,'Material conversion to finished goods','production_batch',batch,auth.uid()) RETURNING id INTO journal;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    VALUES(journal,inventory_gl,round(total_cost,2),0,'Finished goods',1),(journal,inventory_gl,0,round(total_cost,2),'Consumed materials',2);
  UPDATE public.journal_entries SET posted=true WHERE id=journal;
  INSERT INTO public.production_batches(id,tenant_id,batch_no,warehouse_id,product_id,quantity,total_cost,unit_cost,valuation_method,journal_entry_id,created_by)
    VALUES(batch,_tenant_id,'PROD-'||batch::text,warehouse,output_id,output_qty,total_cost,round(total_cost/output_qty,6),method,journal,auth.uid());
  INSERT INTO public.production_batch_materials(batch_id,product_id,quantity,total_cost,stock_movement_id)
    SELECT batch,(m->>'product_id')::uuid,(m->>'quantity')::numeric,(m->>'total_cost')::numeric,(m->>'movement_id')::uuid FROM jsonb_array_elements(allocations) m;
  result_payload:=jsonb_build_object('batch_id',batch,'journal_entry_id',journal,'quantity',output_qty,'total_cost',total_cost,'unit_cost',round(total_cost/output_qty,6));
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'production','batch_posted','BOM material conversion',result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.post_material_production(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_material_production(uuid,text,jsonb) TO authenticated;
