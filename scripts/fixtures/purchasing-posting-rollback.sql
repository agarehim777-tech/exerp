-- Execute only in the dedicated staging project, inside a transaction ending in ROLLBACK.
DO $$
DECLARE
  t uuid := nullif(current_setting('erp.audit_tenant',true),'')::uuid;
  w uuid; p uuid; v uuid; po uuid; pol uuid; grn uuid;
  shipment uuid; receipt uuid; inv uuid; account uuid;
  result jsonb; replay jsonb; pay_payload jsonb;
BEGIN
  IF t IS NULL OR auth.uid() IS NULL OR NOT public.is_tenant_member(t,auth.uid()) THEN
    RAISE EXCEPTION 'audit_fixture_scope_required';
  END IF;
  INSERT INTO public.vendors(tenant_id,name) VALUES(t,'QA rollback vendor') RETURNING id INTO v;
  INSERT INTO public.warehouses(tenant_id,code,name)
    VALUES(t,'QA-PURCHASE-'||gen_random_uuid(),'QA rollback purchase warehouse') RETURNING id INTO w;
  INSERT INTO public.products(tenant_id,sku,name)
    VALUES(t,'QA-PURCHASE-'||gen_random_uuid(),'QA rollback purchase product') RETURNING id INTO p;
  INSERT INTO public.purchase_orders(tenant_id,vendor_id,po_number,status)
    VALUES(t,v,'QA-PO-'||gen_random_uuid(),'approved') RETURNING id INTO po;
  INSERT INTO public.purchase_order_lines(po_id,line_no,product_id,product_sku,qty_ordered,unit_price)
    VALUES(po,1,p,'QA-PO-LINE',2,50) RETURNING id INTO pol;
  INSERT INTO public.goods_receipts(tenant_id,po_id,grn_number,received_by)
    VALUES(t,po,'QA-GRN-'||gen_random_uuid(),auth.uid()) RETURNING id INTO grn;
  INSERT INTO public.goods_receipt_lines(grn_id,po_line_id,qty_received,qty_rejected) VALUES(grn,pol,2,0);
  SELECT id INTO shipment FROM public.procurement_shipments WHERE source_grn_id=grn;
  PERFORM public.recalculate_shipment_landed_cost(shipment,true);
  receipt := public.receive_landed_cost_shipment(shipment,w,current_date);
  IF public.receive_landed_cost_shipment(shipment,w,current_date) IS DISTINCT FROM receipt
    OR (SELECT count(*) FROM public.inventory_cost_layers WHERE source_type='procurement_receipt' AND source_id=receipt)<>1 THEN
    RAISE EXCEPTION 'live_receipt_replay_validation_failed';
  END IF;
  INSERT INTO public.vendor_invoices(tenant_id,vendor_id,po_id,invoice_number)
    VALUES(t,v,po,'QA-INV-'||gen_random_uuid()) RETURNING id INTO inv;
  INSERT INTO public.vendor_invoice_lines(invoice_id,po_line_id,qty_invoiced,unit_price,tax_rate)
    VALUES(inv,pol,2,50,0);
  PERFORM public.apply_invoice_match(inv,0,0.02);
  INSERT INTO public.cash_accounts(tenant_id,code,name,type,currency,opening_balance)
    VALUES(t,'QA-CASH-'||gen_random_uuid(),'QA rollback payment cash','cash','AZN',500) RETURNING id INTO account;
  pay_payload := jsonb_build_object('invoice_id',inv,'account_id',account,'payment_date',current_date);
  UPDATE public.vendor_invoice_lines SET tax_rate=18 WHERE invoice_id=inv;
  BEGIN
    PERFORM public.pay_vendor_invoice_atomic(t,'qa-rollback-vat-payment',pay_payload);
    RAISE EXCEPTION 'unaccrued_vat_payment_was_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'invoice_vat_posting_required' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.cash_transactions WHERE reference_type='vendor_invoice' AND reference_id=inv)
    OR EXISTS(SELECT 1 FROM public.operation_requests WHERE tenant_id=t AND request_key='qa-rollback-vat-payment') THEN
    RAISE EXCEPTION 'live_failed_payment_rollback_validation_failed';
  END IF;
  UPDATE public.vendor_invoice_lines SET tax_rate=0 WHERE invoice_id=inv;
  result := public.pay_vendor_invoice_atomic(t,'qa-rollback-vendor-payment',pay_payload);
  replay := public.pay_vendor_invoice_atomic(t,'qa-rollback-vendor-payment',pay_payload);
  IF result IS DISTINCT FROM replay OR (result->>'amount')::numeric IS DISTINCT FROM 100
    OR (SELECT count(*) FROM public.cash_transactions WHERE reference_type='vendor_invoice' AND reference_id=inv)<>1 THEN
    RAISE EXCEPTION 'live_invoice_payment_validation_failed';
  END IF;
  IF (SELECT on_hand FROM public.stock_balances WHERE tenant_id=t AND warehouse_id=w AND product_id=p) IS DISTINCT FROM 2
    OR (SELECT status::text FROM public.vendor_invoices WHERE id=inv) IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'live_purchase_chain_validation_failed';
  END IF;
  IF (SELECT sum(jl.debit-jl.credit) FROM public.journal_lines jl JOIN public.journal_entries j ON j.id=jl.entry_id
      WHERE j.id=(result->>'journal_entry_id')::uuid) IS DISTINCT FROM 0
    OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=(result->>'journal_entry_id')::uuid AND posted) THEN
    RAISE EXCEPTION 'live_payment_journal_validation_failed';
  END IF;
  IF (SELECT opening_balance FROM public.cash_accounts WHERE id=account)
    +(SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) FROM public.cash_transactions WHERE account_id=account) IS DISTINCT FROM 400 THEN
    RAISE EXCEPTION 'live_cash_balance_validation_failed';
  END IF;
  BEGIN
    UPDATE public.vendor_invoice_lines SET unit_price=51 WHERE invoice_id=inv;
    RAISE EXCEPTION 'paid_invoice_mutation_was_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'paid_invoice_is_immutable' THEN RAISE; END IF;
  END;
END $$;
SELECT 'purchase_posting_rollback_passed' AS audit_result;
