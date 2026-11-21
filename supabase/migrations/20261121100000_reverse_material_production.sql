-- Cancel (storno) a posted production batch. post_material_production consumed materials, received the finished
-- goods with a cost layer and posted a journal entry, so a batch is never deleted or edited in place: it is
-- reversed. The finished goods leave the warehouse (only while they are still there and unreserved), every
-- material comes back at the cost it was consumed at, the journal entry gets a mirror entry, and the batch is
-- marked reversed. "Edit" in the app is reverse + post again.

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid REFERENCES public.journal_entries(id);

CREATE OR REPLACE FUNCTION public.reverse_material_production(_tenant_id uuid, _batch_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  b public.production_batches%rowtype;
  balance public.stock_balances%rowtype;
  layer public.inventory_cost_layers%rowtype;
  material public.production_batch_materials%rowtype;
  output_movement uuid; movement uuid; journal uuid; unit numeric;
  reason text := trim(coalesce(_reason, ''));
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'production','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF length(reason) < 3 OR length(reason) > 500 THEN RAISE EXCEPTION 'production_reversal_reason_required'; END IF;

  SELECT * INTO b FROM public.production_batches WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'production_batch_not_found'; END IF;
  -- A repeated call (double click, retry) returns the first result instead of reversing twice.
  IF b.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('batch_id',b.id,'journal_entry_id',b.reversal_journal_entry_id,'already_reversed',true);
  END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);

  -- Same lock order as post_material_production: tenant production lock, then balances in product order.
  PERFORM pg_advisory_xact_lock(hashtextextended('production:'||_tenant_id::text,0));
  PERFORM 1 FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=b.warehouse_id
    AND (product_id=b.product_id OR product_id IN (SELECT m.product_id FROM public.production_batch_materials m WHERE m.batch_id=b.id))
    ORDER BY product_id FOR UPDATE;

  -- 1. Finished goods leave the warehouse. They must still be on hand and unreserved, and their own cost layer
  --    must be untouched; otherwise they were sold, reserved or transferred and the batch cannot be undone.
  SELECT * INTO balance FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
  IF NOT FOUND OR balance.on_hand - balance.reserved - coalesce(balance.problem_qty,0) < b.quantity THEN
    RAISE EXCEPTION 'production_output_already_used';
  END IF;
  SELECT * INTO layer FROM public.inventory_cost_layers
    WHERE tenant_id=_tenant_id AND source_type='production_batch' AND source_id=b.id FOR UPDATE;
  IF FOUND THEN
    IF layer.remaining_qty < b.quantity THEN RAISE EXCEPTION 'production_output_already_used'; END IF;
    UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-b.quantity WHERE id=layer.id;
  ELSIF b.valuation_method='fifo' THEN
    RAISE EXCEPTION 'inventory_cost_layer_missing';
  END IF;
  SELECT id INTO output_movement FROM public.stock_movements
    WHERE tenant_id=_tenant_id AND reference_type='production_batch' AND reference_id=b.id AND movement_type='receipt'
    ORDER BY created_at LIMIT 1;
  UPDATE public.stock_balances SET on_hand=on_hand-b.quantity, updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by,reversal_of)
    VALUES(_tenant_id,b.warehouse_id,b.product_id,'write_off',-b.quantity,b.unit_cost,'production_reversal',b.id,
      'Production batch cancelled: '||reason,auth.uid(),output_movement);

  -- 2. Every material comes back at the cost it was consumed at, as a new cost layer. The balance is raised
  --    before the movement so the receipt trigger re-weights avg_cost correctly.
  FOR material IN SELECT * FROM public.production_batch_materials WHERE batch_id=b.id ORDER BY product_id LOOP
    unit := round(material.total_cost / material.quantity, 6);
    INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved)
      VALUES(_tenant_id,b.warehouse_id,material.product_id,material.quantity,0)
      ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET on_hand=public.stock_balances.on_hand+excluded.on_hand, updated_at=now();
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by,reversal_of)
      VALUES(_tenant_id,b.warehouse_id,material.product_id,'receipt',material.quantity,unit,'production_reversal',b.id,
        'Material returned from cancelled production',auth.uid(),material.stock_movement_id)
      RETURNING id INTO movement;
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
      VALUES(_tenant_id,b.warehouse_id,material.product_id,movement,'production_reversal',b.id,material.quantity,material.quantity,unit);
  END LOOP;

  -- 3. Mirror journal entry (debit and credit swapped), dated today.
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,current_date,b.batch_no||'-R','Production batch cancelled: '||reason,'production_reversal',b.id,auth.uid())
    RETURNING id INTO journal;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    SELECT journal,account_id,credit,debit,'Reversal: '||coalesce(memo,''),line_no
      FROM public.journal_lines WHERE entry_id=b.journal_entry_id ORDER BY line_no;
  UPDATE public.journal_entries SET posted=true WHERE id=journal;

  UPDATE public.production_batches
    SET reversed_at=now(), reversed_by=auth.uid(), reversal_reason=reason, reversal_journal_entry_id=journal
    WHERE id=b.id;
  result_payload := jsonb_build_object('batch_id',b.id,'journal_entry_id',journal,'quantity',b.quantity,'total_cost',b.total_cost);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'production','batch_reversed',reason,result_payload);
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.reverse_material_production(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_material_production(uuid,uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
