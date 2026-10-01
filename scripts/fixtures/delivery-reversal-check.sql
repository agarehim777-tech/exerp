BEGIN;
SELECT set_config('request.jwt.claim.sub','__ACTOR__',true);
SET LOCAL ROLE authenticated;
DO $$
#variable_conflict use_variable
DECLARE
  tenant uuid := '__TENANT__'; actor uuid := '__ACTOR__';
  customer uuid; product uuid; warehouse uuid; account uuid; other_warehouse uuid;
  sale jsonb; replay jsonb; order_id uuid; credit uuid; reservation uuid;
  delivery uuid; layer uuid; unrelated uuid; invoice uuid; journal uuid;
  method text; path text; marker text;
BEGIN
  FOREACH method IN ARRAY ARRAY['weighted_average','fifo'] LOOP
    FOREACH path IN ARRAY ARRAY['status','mark','complete'] LOOP
      marker := 'ROLLBACK-DELIVERY-'||method||'-'||path||'-'||gen_random_uuid();
      INSERT INTO public.customers(tenant_id,name) VALUES(tenant,marker) RETURNING id INTO customer;
      INSERT INTO public.products(tenant_id,sku,name) VALUES(tenant,marker,marker) RETURNING id INTO product;
      INSERT INTO public.warehouses(tenant_id,code,name) VALUES(tenant,marker,marker) RETURNING id INTO warehouse;
      INSERT INTO public.cash_accounts(tenant_id,code,name,account_no,opening_balance) VALUES(tenant,marker,marker,marker,0) RETURNING id INTO account;
      IF path='complete' THEN
        INSERT INTO public.warehouses(tenant_id,code,name) VALUES(tenant,marker||'-OTHER',marker||'-OTHER') RETURNING id INTO other_warehouse;
        PERFORM public.receive_stock(tenant,other_warehouse,product,10,99,'test',NULL,marker);
      END IF;
      PERFORM public.receive_stock(tenant,warehouse,product,10,25,'test',NULL,marker);
      INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(tenant) ON CONFLICT DO NOTHING;
      UPDATE public.inventory_accounting_settings SET valuation_method=method WHERE tenant_id=tenant;
      SELECT id INTO layer FROM public.inventory_cost_layers WHERE tenant_id=tenant AND warehouse_id=warehouse AND product_id=product;
      sale := public.create_sales_order_complete(tenant,marker||':create',marker,customer,current_date,'AZN',marker,
        jsonb_build_array(jsonb_build_object('line_no',1,'description',marker,'product_id',product,'qty',2,'unit_price',1000,'discount_pct',0,'vat_rate',0)),
        jsonb_build_object('contract_no',marker,'principal',2000,'initial_payment',200,'required_initial',1000,'term_months',12),
        '[]'::jsonb,200,account);
      order_id := (sale->>'order_id')::uuid; credit := (sale->>'credit_id')::uuid;
      reservation := public.reserve_stock(tenant,warehouse,product,order_id,NULL,2);
      BEGIN
        UPDATE public.orders SET status='cancelled' WHERE id=order_id;
        RAISE EXCEPTION 'direct cancellation bypassed linked reversals';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%sales_cancellation_requires_reversal_command%' THEN RAISE; END IF;
      END;
      INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,category,reference_id,reference,description)
        VALUES(tenant,account,'in',17,'sales_payment',gen_random_uuid(),marker||'-OTHER','Unrelated payment mentioning '||marker) RETURNING id INTO unrelated;
      IF path='complete' THEN
        INSERT INTO public.deliveries(tenant_id,delivery_no,order_id,warehouse_id,status)
          VALUES(tenant,marker,order_id,warehouse,'ready') RETURNING id INTO delivery;
        INSERT INTO public.delivery_items(tenant_id,delivery_id,product_id,reservation_id,quantity)
          VALUES(tenant,delivery,product,reservation,2);
        PERFORM public.complete_delivery(tenant,delivery,'Test recipient','Test document');
        PERFORM public.complete_delivery(tenant,delivery,'Test recipient','Test document');
      ELSIF path='mark' THEN
        PERFORM public.mark_sales_order_delivered(order_id);
        PERFORM public.mark_sales_order_delivered(order_id);
      ELSE
        PERFORM public.process_sales_order_status(order_id,'delivered');
        PERFORM public.process_sales_order_status(order_id,'delivered');
      END IF;
      IF (SELECT on_hand FROM public.stock_balances WHERE tenant_id=tenant AND warehouse_id=warehouse AND product_id=product)<>8 THEN RAISE EXCEPTION 'delivery stock changed twice: %/%',method,path; END IF;
      IF path='complete' AND (SELECT on_hand FROM public.stock_balances WHERE tenant_id=tenant AND warehouse_id=other_warehouse AND product_id=product)<>10 THEN RAISE EXCEPTION 'delivery consumed the wrong warehouse'; END IF;
      IF (SELECT count(*) FROM public.order_accounting_events e WHERE e.order_id=order_id AND event_type='delivery')<>1 THEN RAISE EXCEPTION 'delivery posted twice'; END IF;
      SELECT journal_entry_id INTO journal FROM public.order_accounting_events e WHERE e.order_id=order_id AND event_type='delivery';
      INSERT INTO public.sales_invoices(tenant_id,invoice_no,order_id,customer_id,status,posted,journal_entry_id,total,subtotal,vat_total)
        VALUES(tenant,marker,order_id,customer,'issued',true,journal,2000,2000,0) RETURNING id INTO invoice;
      replay := public.reverse_sales_order_v3(tenant,order_id,marker,marker||':reverse');
      IF public.reverse_sales_order_v3(tenant,order_id,marker,marker||':reverse')<>replay THEN RAISE EXCEPTION 'reversal replay differs'; END IF;
      IF (SELECT on_hand FROM public.stock_balances WHERE tenant_id=tenant AND warehouse_id=warehouse AND product_id=product)<>10 THEN RAISE EXCEPTION 'stock not restored'; END IF;
      IF method='fifo' AND (SELECT remaining_qty FROM public.inventory_cost_layers WHERE id=layer)<>10 THEN RAISE EXCEPTION 'FIFO layer not restored'; END IF;
      IF EXISTS(SELECT 1 FROM public.stock_reservations r WHERE r.order_id=order_id AND r.status='active') THEN RAISE EXCEPTION 'active reservation after reversal'; END IF;
      IF EXISTS(SELECT 1 FROM public.credit_contracts c WHERE c.id=credit AND c.status::text NOT IN('cancelled','closed')) THEN RAISE EXCEPTION 'active credit after reversal'; END IF;
      IF EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=order_id AND d.status<>'cancelled') THEN RAISE EXCEPTION 'active delivery after reversal'; END IF;
      IF (SELECT status::text FROM public.sales_invoices WHERE id=invoice)<>'cancelled' THEN RAISE EXCEPTION 'invoice not cancelled'; END IF;
      BEGIN
        UPDATE public.credit_contracts SET status='active' WHERE id=credit;
        RAISE EXCEPTION 'cancelled credit reactivated';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%cancelled_order_is_terminal%' THEN RAISE; END IF;
      END;
      BEGIN
        INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,category,reference_id,reference)
          VALUES(tenant,account,'in',1,'sales_payment',order_id,marker);
        RAISE EXCEPTION 'cancelled sale accepted payment';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%cancelled_order_is_terminal%' THEN RAISE; END IF;
      END;
      IF EXISTS(SELECT 1 FROM public.cash_transactions WHERE reversal_of=unrelated) THEN RAISE EXCEPTION 'unrelated payment reversed by description'; END IF;
      IF (SELECT sum(CASE direction WHEN 'in' THEN amount ELSE -amount END) FROM public.cash_transactions WHERE account_id=account)<>17 THEN RAISE EXCEPTION 'linked cash not reversed exactly once'; END IF;
      IF EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.entry_id
        WHERE j.source_id=order_id GROUP BY l.entry_id HAVING sum(l.debit)<>sum(l.credit)) THEN RAISE EXCEPTION 'unbalanced journal'; END IF;
      BEGIN
        PERFORM public.mark_sales_order_delivered(order_id);
        RAISE EXCEPTION 'cancelled sale allowed delivery';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%cancelled_order_is_terminal%' THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
