CREATE OR REPLACE FUNCTION public.receive_stock(_tenant_id uuid,_warehouse_id uuid,_product_id uuid,
  _quantity numeric,_unit_cost numeric,_reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE movement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'warehouse','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _quantity IS NULL OR _quantity<=0 OR _quantity::text IN('NaN','Infinity','-Infinity')
    OR _unit_cost IS NULL OR _unit_cost<0 OR _unit_cost::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_stock_receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=_product_id AND tenant_id=_tenant_id)
    OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active)
    THEN RAISE EXCEPTION 'invalid_stock_scope'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved)
    VALUES(_tenant_id,_warehouse_id,_product_id,_quantity,0)
    ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET on_hand=public.stock_balances.on_hand+excluded.on_hand,updated_at=now();
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(_tenant_id,_warehouse_id,_product_id,'receipt',_quantity,_unit_cost,_reference_type,_reference_id,_note,auth.uid()) RETURNING id INTO movement_id;
  -- Landed-cost receipts own their dated layers in receive_landed_cost_shipment.
  IF _reference_type IS DISTINCT FROM 'procurement_receipt' THEN
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
      VALUES(_tenant_id,_warehouse_id,_product_id,movement_id,coalesce(_reference_type,'manual_receipt'),_reference_id,_quantity,_quantity,_unit_cost);
  END IF;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse','receipt','Stock receipt',jsonb_build_object('movement_id',movement_id,'quantity',_quantity));
  RETURN movement_id;
END $$;
REVOKE ALL ON FUNCTION public.receive_stock(uuid,uuid,uuid,numeric,numeric,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid,uuid,uuid,numeric,numeric,text,uuid,text) TO authenticated,service_role;