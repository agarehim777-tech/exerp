-- Warehouse transfers and manual stock movements as server commands.
--
-- The Anbar page wrote these rows straight into stock_movements with the retired legacy columns
-- (move_type, qty, doc_no, sku). Those columns no longer exist, so every manual "Məxaric", "Düzəliş" and
-- every transfer between warehouses failed. Even a row with the current columns would not move stock: the
-- balance trigger skips canonical rows because commands own stock_balances. These commands do the whole
-- move in one transaction: balance lock, availability check, FIFO cost layers, movements and audit event.

-- Takes _quantity out of one warehouse balance. Consumes FIFO cost layers first; stock without layers
-- (older data) is valued at the balance's average cost. Returns the total cost of what left.
CREATE OR REPLACE FUNCTION private.take_stock_out(_tenant_id uuid,_warehouse_id uuid,_product_id uuid,_quantity numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE balance public.stock_balances%rowtype; layer public.inventory_cost_layers%rowtype;
  need numeric:=_quantity; take numeric; total numeric:=0;
BEGIN
  SELECT * INTO balance FROM public.stock_balances
    WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id AND product_id=_product_id FOR UPDATE;
  IF NOT FOUND OR balance.on_hand-coalesce(balance.reserved,0)-coalesce(balance.problem_qty,0)<_quantity THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;
  FOR layer IN SELECT * FROM public.inventory_cost_layers WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id
      AND product_id=_product_id AND remaining_qty>0 ORDER BY received_at,id FOR UPDATE LOOP
    EXIT WHEN need<=0;
    take:=least(need,layer.remaining_qty);
    UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=layer.id;
    total:=total+take*layer.unit_cost; need:=need-take;
  END LOOP;
  IF need>0 THEN total:=total+need*coalesce(balance.avg_cost,0); END IF;
  UPDATE public.stock_balances SET on_hand=on_hand-_quantity,updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id AND product_id=_product_id;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION private.take_stock_out(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;

-- Raises a warehouse balance by _quantity. With _blend_cost the average cost is blended with _unit_cost
-- here; without it the caller writes a receipt/transfer_in movement next, and the movement trigger
-- (update_stock_balance_average_cost) blends it, as for receive_stock.
CREATE OR REPLACE FUNCTION private.raise_stock_balance(_tenant_id uuid,_warehouse_id uuid,_product_id uuid,_quantity numeric,
  _unit_cost numeric,_blend_cost boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved,avg_cost)
    VALUES(_tenant_id,_warehouse_id,_product_id,_quantity,0,CASE WHEN _blend_cost THEN _unit_cost ELSE 0 END)
    ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET
      avg_cost=CASE WHEN NOT _blend_cost THEN public.stock_balances.avg_cost
        WHEN greatest(public.stock_balances.on_hand,0)+excluded.on_hand>0
        THEN round((greatest(public.stock_balances.on_hand,0)*public.stock_balances.avg_cost+excluded.on_hand*_unit_cost)
          /(greatest(public.stock_balances.on_hand,0)+excluded.on_hand),6)
        ELSE _unit_cost END,
      on_hand=public.stock_balances.on_hand+excluded.on_hand,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION private.raise_stock_balance(uuid,uuid,uuid,numeric,numeric,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.assert_stock_scope(_tenant_id uuid,_warehouse_id uuid,_product_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=_product_id AND tenant_id=_tenant_id)
    OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active)
    THEN RAISE EXCEPTION 'invalid_stock_scope'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_stock_scope(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Moves stock between two warehouses of the same tenant at its current cost. No journal entry: the goods
-- stay on the same inventory account.
CREATE OR REPLACE FUNCTION public.transfer_stock(_tenant_id uuid,_from_warehouse_id uuid,_to_warehouse_id uuid,
  _product_id uuid,_quantity numeric,_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE transfer uuid:=gen_random_uuid(); total numeric; unit numeric; in_movement uuid; first_wh uuid; second_wh uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _quantity IS NULL OR _quantity<=0 OR _quantity::text IN('NaN','Infinity') THEN RAISE EXCEPTION 'invalid_stock_quantity'; END IF;
  IF _from_warehouse_id IS NULL OR _to_warehouse_id IS NULL OR _from_warehouse_id=_to_warehouse_id THEN
    RAISE EXCEPTION 'invalid_stock_transfer';
  END IF;
  PERFORM private.assert_stock_scope(_tenant_id,_from_warehouse_id,_product_id);
  PERFORM private.assert_stock_scope(_tenant_id,_to_warehouse_id,_product_id);
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  -- Lock both balances in one order so two opposite transfers cannot deadlock.
  first_wh:=least(_from_warehouse_id,_to_warehouse_id); second_wh:=greatest(_from_warehouse_id,_to_warehouse_id);
  PERFORM 1 FROM public.stock_balances WHERE tenant_id=_tenant_id AND product_id=_product_id
    AND warehouse_id IN(first_wh,second_wh) ORDER BY warehouse_id FOR UPDATE;

  total:=private.take_stock_out(_tenant_id,_from_warehouse_id,_product_id,_quantity);
  unit:=round(total/_quantity,6);
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(_tenant_id,_from_warehouse_id,_product_id,'transfer_out',-_quantity,unit,'stock_transfer',transfer,coalesce(nullif(_note,''),'Daxili anbar transferi'),auth.uid());
  -- Balance first, then the transfer_in row: its trigger blends the destination average cost.
  PERFORM private.raise_stock_balance(_tenant_id,_to_warehouse_id,_product_id,_quantity,unit,false);
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(_tenant_id,_to_warehouse_id,_product_id,'transfer_in',_quantity,unit,'stock_transfer',transfer,coalesce(nullif(_note,''),'Daxili anbar transferi'),auth.uid())
    RETURNING id INTO in_movement;
  INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
    VALUES(_tenant_id,_to_warehouse_id,_product_id,in_movement,'stock_transfer',transfer,_quantity,_quantity,unit);

  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse','transfer','Stock transfer',
      jsonb_build_object('transfer_id',transfer,'product_id',_product_id,'from',_from_warehouse_id,'to',_to_warehouse_id,'quantity',_quantity));
  RETURN jsonb_build_object('transfer_id',transfer,'quantity',_quantity,'unit_cost',unit);
END $$;
REVOKE ALL ON FUNCTION public.transfer_stock(uuid,uuid,uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid,uuid,uuid,uuid,numeric,text) TO authenticated,service_role;

-- Manual movement from the Anbar page.
--   _kind 'out'    : stock leaves the warehouse (write-off), _quantity > 0, valued at FIFO/average cost.
--   _kind 'adjust' : signed count correction. A positive _quantity adds stock at _unit_cost (or the
--                    current average cost when none is given); a negative one removes stock like 'out'.
-- Mədaxil (receipt) keeps using receive_stock.
CREATE OR REPLACE FUNCTION public.post_manual_stock_movement(_tenant_id uuid,_warehouse_id uuid,_product_id uuid,
  _kind text,_quantity numeric,_unit_cost numeric DEFAULT NULL,_document_no text DEFAULT NULL,_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE movement uuid; total numeric; unit numeric; amount numeric; current_cost numeric; label text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _kind NOT IN('out','adjust') OR _quantity IS NULL OR _quantity=0 OR _quantity::text IN('NaN','Infinity','-Infinity')
    OR (_kind='out' AND _quantity<0) OR (_unit_cost IS NOT NULL AND (_unit_cost<0 OR _unit_cost::text IN('NaN','Infinity')))
    THEN RAISE EXCEPTION 'invalid_stock_quantity'; END IF;
  PERFORM private.assert_stock_scope(_tenant_id,_warehouse_id,_product_id);
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  label:=concat_ws(' · ',nullif(trim(coalesce(_document_no,'')),''),nullif(trim(coalesce(_note,'')),''));

  IF _kind='adjust' AND _quantity>0 THEN
    SELECT avg_cost INTO current_cost FROM public.stock_balances
      WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id AND product_id=_product_id FOR UPDATE;
    unit:=coalesce(_unit_cost,current_cost,0);
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(_tenant_id,_warehouse_id,_product_id,'adjustment',_quantity,unit,'manual_adjustment',NULL,coalesce(nullif(label,''),'Sayım düzəlişi'),auth.uid())
      RETURNING id INTO movement;
    -- 'adjustment' rows are not blended by the movement trigger, so the balance blends the cost itself.
    PERFORM private.raise_stock_balance(_tenant_id,_warehouse_id,_product_id,_quantity,unit,true);
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
      VALUES(_tenant_id,_warehouse_id,_product_id,movement,'manual_adjustment',NULL,_quantity,_quantity,unit);
  ELSE
    amount:=abs(_quantity);
    total:=private.take_stock_out(_tenant_id,_warehouse_id,_product_id,amount);
    unit:=round(total/amount,6);
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(_tenant_id,_warehouse_id,_product_id,CASE WHEN _kind='out' THEN 'write_off' ELSE 'adjustment' END,-amount,unit,
        CASE WHEN _kind='out' THEN 'manual_write_off' ELSE 'manual_adjustment' END,NULL,
        coalesce(nullif(label,''),CASE WHEN _kind='out' THEN 'Əl ilə məxaric' ELSE 'Sayım düzəlişi' END),auth.uid())
      RETURNING id INTO movement;
  END IF;

  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse',CASE WHEN _kind='out' THEN 'write_off' ELSE 'adjustment' END,
      'Manual stock movement',jsonb_build_object('movement_id',movement,'product_id',_product_id,'quantity',_quantity,'document_no',_document_no));
  RETURN movement;
END $$;
REVOKE ALL ON FUNCTION public.post_manual_stock_movement(uuid,uuid,uuid,text,numeric,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_manual_stock_movement(uuid,uuid,uuid,text,numeric,numeric,text,text) TO authenticated,service_role;

NOTIFY pgrst, 'reload schema';
