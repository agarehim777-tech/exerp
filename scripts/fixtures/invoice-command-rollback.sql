-- Run only on the isolated staging E2E tenant. No fixture rows are committed.
BEGIN;
SELECT set_config('request.jwt.claim.sub','f615d4f7-1b8d-4e32-9205-5014be299c0d',true);
DO $$
DECLARE
  tenant uuid := 'e6e055c9-f9c8-4480-9070-4ef9d46a1d2d';
  customer uuid := gen_random_uuid();
  account uuid := gen_random_uuid();
  marker text := 'invoice-rollback-'||gen_random_uuid()::text;
  payload jsonb; invoice jsonb; replay jsonb; receipt jsonb; receipt_payload jsonb;
  journal uuid; actual numeric; failure_seen boolean;
BEGIN
  IF NOT private.has_module_access(tenant,'invoices','edit')
    OR NOT private.has_module_access(tenant,'finance','edit') THEN RAISE EXCEPTION 'fixture_actor_unavailable'; END IF;
  INSERT INTO public.customers(id,tenant_id,name) VALUES(customer,tenant,marker);
  INSERT INTO public.cash_accounts(id,tenant_id,code,name,type,currency,opening_balance)
    VALUES(account,tenant,marker,marker,'cash','AZN',0);
  payload := jsonb_build_object('customer_id',customer,'invoice_no',marker,'invoice_date','2026-10-06',
    'lines',jsonb_build_array(jsonb_build_object('description','Decimal test','qty','3',
      'unit_price','10.01','discount_pct','10','vat_rate','18')));
  invoice := public.create_sales_invoice_atomic(tenant,marker,payload);
  replay := public.create_sales_invoice_atomic(tenant,marker,payload);
  IF replay<>invoice OR (invoice->>'total')::numeric<>31.90 OR (invoice->>'vat_total')::numeric<>4.87 THEN
    RAISE EXCEPTION 'fixture_invoice_decimal_or_replay_failed'; END IF;
  journal := public.post_invoice_to_gl((invoice->>'invoice_id')::uuid);
  IF public.post_invoice_to_gl((invoice->>'invoice_id')::uuid)<>journal THEN RAISE EXCEPTION 'fixture_post_replay_failed'; END IF;
  receipt_payload := jsonb_build_object('invoice_id',invoice->>'invoice_id','account_id',account,'amount','15.10','paid_at','2026-10-06');
  receipt := public.record_invoice_payment_atomic(tenant,marker||'-pay',receipt_payload);
  replay := public.record_invoice_payment_atomic(tenant,marker||'-pay',receipt_payload);
  IF replay<>receipt THEN RAISE EXCEPTION 'fixture_payment_replay_failed'; END IF;
  SELECT paid_amount INTO actual FROM public.sales_invoices WHERE id=(invoice->>'invoice_id')::uuid;
  IF actual<>15.10 THEN RAISE EXCEPTION 'fixture_invoice_paid_failed'; END IF;
  SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) INTO actual
    FROM public.cash_transactions WHERE tenant_id=tenant AND account_id=account;
  IF actual<>15.10 THEN RAISE EXCEPTION 'fixture_cash_receipt_failed'; END IF;
  failure_seen := false;
  BEGIN
    PERFORM public.record_invoice_payment_atomic(tenant,marker||'-overpay',receipt_payload||'{"amount":"21"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'invalid_amount' THEN RAISE; END IF;
    failure_seen := true;
  END;
  IF NOT failure_seen THEN RAISE EXCEPTION 'fixture_overpayment_was_allowed'; END IF;
  IF EXISTS(SELECT 1 FROM public.operation_requests WHERE tenant_id=tenant AND request_key=marker||'-overpay') THEN
    RAISE EXCEPTION 'fixture_failed_command_left_request'; END IF;
  PERFORM public.cancel_sales_invoice((invoice->>'invoice_id')::uuid);
  PERFORM public.cancel_sales_invoice((invoice->>'invoice_id')::uuid);
  SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) INTO actual
    FROM public.cash_transactions WHERE tenant_id=tenant AND account_id=account;
  IF actual<>0 THEN RAISE EXCEPTION 'fixture_cash_cancellation_failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries e ON e.id=l.entry_id
    WHERE e.tenant_id=tenant AND (e.source_id IN((invoice->>'invoice_id')::uuid,(receipt->>'payment_id')::uuid))
    GROUP BY l.account_id HAVING sum(l.debit-l.credit)<>0) THEN RAISE EXCEPTION 'fixture_gl_cancellation_failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.invoice_payments WHERE id=(receipt->>'payment_id')::uuid
    AND reversed_at IS NOT NULL AND cash_transaction_id=(receipt->>'transaction_id')::uuid
    AND reversal_journal_entry_id IS NOT NULL) THEN RAISE EXCEPTION 'fixture_receipt_reversal_failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_invoices WHERE id=(invoice->>'invoice_id')::uuid AND status='cancelled' AND paid_amount=0) THEN
    RAISE EXCEPTION 'fixture_invoice_cancellation_failed'; END IF;
END $$;
ROLLBACK;
SELECT 'invoice decimal totals, replay, cash/GL receipt, overpayment rollback and cancellation verified; fixture rolled back' AS result;
