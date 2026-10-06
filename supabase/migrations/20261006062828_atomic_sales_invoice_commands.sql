-- Invoice receipts own a cash row and a journal, not a second sales payment.
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS cash_transaction_id uuid REFERENCES public.cash_transactions(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_cash_row_idx ON public.invoice_payments(cash_transaction_id)
  WHERE cash_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_payments_journal_idx ON public.invoice_payments(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_payments_reversal_journal_idx ON public.invoice_payments(reversal_journal_entry_id)
  WHERE reversal_journal_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_sales_invoice_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  invoice_id uuid := gen_random_uuid();
  customer_id uuid;
  source_order_id uuid;
  invoice_no text;
  business_date date;
  due_date date;
  currency_value text;
  source_order public.orders%rowtype;
  line jsonb;
  line_number integer := 0;
  product_id uuid;
  quantity numeric;
  price numeric;
  discount numeric;
  vat_rate numeric;
  net numeric;
  vat numeric;
  net_total numeric := 0;
  vat_total_value numeric := 0;
  gross_total numeric;
  paid numeric := 0;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'invoices','edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'create_sales_invoice_atomic',md5(_payload::text))
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF request.operation<>'create_sales_invoice_atomic' OR request.request_hash<>md5(_payload::text) THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  business_date := coalesce(nullif(_payload->>'invoice_date','')::date,(now() AT TIME ZONE 'Asia/Baku')::date);
  due_date := nullif(_payload->>'due_date','')::date;
  IF due_date<business_date THEN RAISE EXCEPTION 'invalid_due_date'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  currency_value := coalesce(nullif(_payload->>'currency',''),'AZN');
  IF currency_value<>'AZN' THEN RAISE EXCEPTION 'invoice_currency_not_supported'; END IF;
  customer_id := nullif(_payload->>'customer_id','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.tenant_id=_tenant_id) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;
  source_order_id := nullif(_payload->>'order_id','')::uuid;
  IF source_order_id IS NOT NULL THEN
    SELECT * INTO source_order FROM public.orders o WHERE o.id=source_order_id AND o.tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
    IF source_order.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
    IF source_order.customer_id IS DISTINCT FROM customer_id OR source_order.currency<>currency_value THEN
      RAISE EXCEPTION 'invoice_order_mismatch';
    END IF;
    IF EXISTS(SELECT 1 FROM public.sales_invoices i WHERE i.tenant_id=_tenant_id AND i.order_id=source_order_id AND i.status::text<>'cancelled') THEN
      RAISE EXCEPTION 'order_already_invoiced';
    END IF;
    paid := source_order.paid_amount;
  END IF;
  -- Serialize number allocation as well as user-entered duplicate numbers.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-number:'||_tenant_id::text,0));
  invoice_no := coalesce(nullif(trim(_payload->>'invoice_no'),''),
    public.generate_doc_number(_tenant_id,'INV','sales_invoices','invoice_no'));
  INSERT INTO public.sales_invoices(id,tenant_id,invoice_no,customer_id,order_id,invoice_date,due_date,currency,notes,created_by)
    VALUES(invoice_id,_tenant_id,invoice_no,customer_id,source_order_id,business_date,due_date,currency_value,_payload->>'notes',auth.uid());
  FOR line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_invoice_line'; END IF;
    quantity := (line->>'qty')::numeric;
    price := (line->>'unit_price')::numeric;
    discount := coalesce(nullif(line->>'discount_pct','')::numeric,0);
    vat_rate := coalesce(nullif(line->>'vat_rate','')::numeric,0);
    IF quantity IS NULL OR price IS NULL OR quantity<=0 OR price<0 OR discount NOT BETWEEN 0 AND 100
      OR vat_rate NOT BETWEEN 0 AND 100 OR quantity::text IN('NaN','Infinity','-Infinity')
      OR price::text IN('NaN','Infinity','-Infinity') OR discount::text IN('NaN','Infinity','-Infinity')
      OR vat_rate::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_invoice_amount'; END IF;
    product_id := nullif(line->>'product_id','')::uuid;
    IF product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p
      WHERE p.id=product_id AND p.tenant_id=_tenant_id AND p.is_active) THEN RAISE EXCEPTION 'product_not_found'; END IF;
    net := round(quantity*price*(1-discount/100),2);
    vat := round(net*vat_rate/100,2);
    net_total := net_total+net;
    vat_total_value := vat_total_value+vat;
    line_number := line_number+1;
    INSERT INTO public.sales_invoice_lines(tenant_id,invoice_id,product_id,line_no,description,qty,unit_price,discount_pct,vat_rate,line_total)
      VALUES(_tenant_id,invoice_id,product_id,line_number,line->>'description',quantity,price,discount,vat_rate,net+vat);
  END LOOP;
  gross_total := net_total+vat_total_value;
  IF gross_total<=0 THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  IF source_order_id IS NOT NULL AND (gross_total<>round(source_order.total,2) OR vat_total_value<>round(source_order.vat_total,2)) THEN
    RAISE EXCEPTION 'invoice_order_totals_mismatch';
  END IF;
  UPDATE public.sales_invoices SET subtotal=net_total,vat_total=vat_total_value,total=gross_total,paid_amount=paid,
    status=CASE WHEN paid>=gross_total THEN 'paid'::public.sales_invoice_status
      WHEN paid>0 THEN 'partial'::public.sales_invoice_status ELSE 'draft'::public.sales_invoice_status END
    WHERE id=invoice_id;
  result_payload := jsonb_build_object('invoice_id',invoice_id,'invoice_no',invoice_no,'total',gross_total,'vat_total',vat_total_value);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'invoices','invoice_created',invoice_no,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END $$;

CREATE OR REPLACE FUNCTION public.post_invoice_to_gl(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.sales_invoices%rowtype; linked_order uuid; source_order public.orders%rowtype;
  entry_id uuid; ar uuid; revenue uuid; vat_account uuid;
BEGIN
  SELECT order_id INTO linked_order FROM public.sales_invoices WHERE id=_invoice_id;
  -- Order first matches cancellation and delivery lock order.
  IF linked_order IS NOT NULL THEN SELECT * INTO source_order FROM public.orders WHERE id=linked_order FOR UPDATE; END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT private.has_module_access(inv.tenant_id,'invoices','edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF inv.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.posted THEN
    IF NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=inv.journal_entry_id AND tenant_id=inv.tenant_id AND posted) THEN
      RAISE EXCEPTION 'invoice_journal_requires_reconciliation';
    END IF;
    RETURN inv.journal_entry_id;
  END IF;
  IF inv.currency<>'AZN' THEN RAISE EXCEPTION 'invoice_currency_not_supported'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id)
    OR inv.total<>(SELECT coalesce(sum(line_total),0) FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id)
    OR inv.vat_total<>(SELECT coalesce(sum(round(round(qty*unit_price*(1-discount_pct/100),2)*vat_rate/100,2)),0)
      FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id) THEN
    RAISE EXCEPTION 'invoice_lines_require_reconciliation';
  END IF;
  IF inv.order_id IS NOT NULL THEN
    IF source_order.tenant_id IS DISTINCT FROM inv.tenant_id OR source_order.status::text='cancelled' THEN
      RAISE EXCEPTION 'invoice_order_mismatch';
    END IF;
    IF round(source_order.total,2)<>inv.total OR round(source_order.vat_total,2)<>inv.vat_total THEN
      RAISE EXCEPTION 'invoice_order_totals_mismatch';
    END IF;
    SELECT journal_entry_id INTO entry_id FROM public.order_accounting_events
      WHERE tenant_id=inv.tenant_id AND order_id=inv.order_id AND event_type='delivery';
    IF entry_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=entry_id AND tenant_id=inv.tenant_id AND posted) THEN
      RAISE EXCEPTION 'invoice_order_delivery_required';
    END IF;
  ELSE
    PERFORM private.assert_open_accounting_period(inv.tenant_id,inv.invoice_date);
    IF inv.total<=0 OR inv.total<>inv.subtotal+inv.vat_total THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
    IF EXISTS(SELECT 1 FROM public.journal_entries WHERE tenant_id=inv.tenant_id AND source_type='sales_invoice' AND source_id=inv.id) THEN
      RAISE EXCEPTION 'invoice_journal_requires_reconciliation';
    END IF;
    ar := public.gl_account_by_code(inv.tenant_id,'1200');
    revenue := public.gl_account_by_code(inv.tenant_id,'4000');
    vat_account := public.gl_account_by_code(inv.tenant_id,'2100');
    IF ar IS NULL OR revenue IS NULL OR (inv.vat_total>0 AND vat_account IS NULL) THEN RAISE EXCEPTION 'chart_of_accounts_incomplete'; END IF;
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
      VALUES(inv.tenant_id,inv.invoice_date,inv.invoice_no,'Sales invoice','sales_invoice',inv.id,auth.uid()) RETURNING id INTO entry_id;
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
      (entry_id,ar,inv.total,0,'Accounts receivable',1),(entry_id,revenue,0,inv.subtotal,'Revenue',2);
    IF inv.vat_total>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
      VALUES(entry_id,vat_account,0,inv.vat_total,'VAT',3); END IF;
    UPDATE public.journal_entries SET posted=true WHERE id=entry_id;
  END IF;
  UPDATE public.sales_invoices SET posted=true,journal_entry_id=entry_id,
    status=CASE WHEN status='draft' THEN 'issued'::public.sales_invoice_status ELSE status END,updated_at=now() WHERE id=inv.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,inv.tenant_id,auth.uid(),'invoices','invoice_posted',inv.invoice_no,
      jsonb_build_object('invoice_id',inv.id,'journal_entry_id',entry_id));
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_payment_to_gl(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; inv public.sales_invoices%rowtype; account public.cash_accounts%rowtype;
  entry_id uuid; cash_id uuid; ar uuid; cash_gl uuid; invoice_id uuid;
BEGIN
  SELECT p.invoice_id INTO invoice_id FROM public.invoice_payments p WHERE p.id=_payment_id;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=invoice_id FOR UPDATE;
  SELECT * INTO pay FROM public.invoice_payments WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT private.has_module_access(pay.tenant_id,'invoices','edit')
    OR NOT private.has_module_access(pay.tenant_id,'finance','edit') OR inv.tenant_id IS DISTINCT FROM pay.tenant_id THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF inv.status::text='cancelled' OR pay.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.order_id IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_use_sales_lifecycle'; END IF;
  IF pay.journal_entry_id IS NOT NULL AND pay.cash_transaction_id IS NOT NULL THEN RETURN pay.journal_entry_id; END IF;
  -- Never auto-repair historical partial postings: they need administrator review.
  IF pay.journal_entry_id IS NOT NULL OR pay.cash_transaction_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.journal_entries
    WHERE tenant_id=pay.tenant_id AND source_type='invoice_payment' AND source_id=pay.id) THEN
    RAISE EXCEPTION 'invoice_payment_requires_reconciliation';
  END IF;
  IF NOT inv.posted THEN RAISE EXCEPTION 'invoice_posting_required'; END IF;
  IF inv.paid_amount>inv.total THEN RAISE EXCEPTION 'invoice_payment_requires_reconciliation'; END IF;
  PERFORM private.assert_open_accounting_period(pay.tenant_id,pay.paid_at);
  SELECT * INTO account FROM public.cash_accounts WHERE id=pay.account_id AND tenant_id=pay.tenant_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF pay.currency<>'AZN' OR account.currency<>pay.currency OR inv.currency<>pay.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  IF pay.amount<=0 OR pay.amount::text IN('NaN','Infinity','-Infinity') OR pay.amount<>round(pay.amount,2) THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  ar := public.gl_account_by_code(pay.tenant_id,'1200');
  cash_gl := coalesce(account.gl_account_id,public.gl_account_by_code(pay.tenant_id,CASE WHEN account.type::text='cash' THEN '1000' ELSE '1010' END));
  IF ar IS NULL OR cash_gl IS NULL OR NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=cash_gl AND tenant_id=pay.tenant_id) THEN
    RAISE EXCEPTION 'chart_of_accounts_incomplete';
  END IF;
  INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference_type,reference_id,
    reference,customer_id,description,occurred_at,created_by)
    VALUES(pay.tenant_id,account.id,'in',pay.amount,pay.currency,'invoice_payment','invoice_payment',pay.id,
      inv.invoice_no,inv.customer_id,'Invoice receipt',pay.paid_at::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()) RETURNING id INTO cash_id;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(pay.tenant_id,pay.paid_at,inv.invoice_no,'Invoice receipt','invoice_payment',pay.id,auth.uid()) RETURNING id INTO entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
    (entry_id,cash_gl,pay.amount,0,'Cash receipt',1),(entry_id,ar,0,pay.amount,'Receivable settled',2);
  UPDATE public.journal_entries SET posted=true WHERE id=entry_id;
  UPDATE public.invoice_payments SET cash_transaction_id=cash_id,journal_entry_id=entry_id WHERE id=pay.id;
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request public.operation_requests%rowtype; inv public.sales_invoices%rowtype;
  amount_value numeric; business_date date; payment_id uuid; entry_id uuid; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'invoices','edit')
    OR NOT private.has_module_access(_tenant_id,'finance','edit') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'record_invoice_payment_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF request.operation<>'record_invoice_payment_atomic' OR request.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=(_payload->>'invoice_id')::uuid AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF inv.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.order_id IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_use_sales_lifecycle'; END IF;
  IF NOT inv.posted THEN RAISE EXCEPTION 'invoice_posting_required'; END IF;
  amount_value := (_payload->>'amount')::numeric;
  business_date := coalesce(nullif(_payload->>'paid_at','')::date,(now() AT TIME ZONE 'Asia/Baku')::date);
  IF amount_value IS NULL OR amount_value<=0 OR amount_value::text IN('NaN','Infinity','-Infinity')
    OR amount_value<>round(amount_value,2) OR amount_value>inv.total-inv.paid_amount THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF business_date<inv.invoice_date THEN RAISE EXCEPTION 'invalid_payment_date'; END IF;
  INSERT INTO public.invoice_payments(tenant_id,invoice_id,account_id,amount,currency,method,reference,paid_at,created_by)
    VALUES(_tenant_id,inv.id,nullif(_payload->>'account_id','')::uuid,amount_value,inv.currency,
      coalesce(nullif(_payload->>'method',''),'bank'),_payload->>'reference',business_date,auth.uid()) RETURNING id INTO payment_id;
  entry_id := public.post_payment_to_gl(payment_id);
  SELECT jsonb_build_object('payment_id',payment_id,'invoice_id',inv.id,'journal_entry_id',entry_id,'transaction_id',p.cash_transaction_id)
    INTO result_payload FROM public.invoice_payments p WHERE p.id=payment_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'invoices','invoice_payment',inv.invoice_no,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END $$;

CREATE OR REPLACE FUNCTION public.sync_invoice_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invoice_id uuid := coalesce(NEW.invoice_id,OLD.invoice_id); inv public.sales_invoices%rowtype; paid numeric;
BEGIN
  SELECT * INTO inv FROM public.sales_invoices WHERE id=invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN coalesce(NEW,OLD); END IF;
  IF inv.order_id IS NOT NULL THEN
    SELECT o.paid_amount INTO paid FROM public.orders o WHERE o.id=inv.order_id AND o.tenant_id=inv.tenant_id;
  ELSE
    SELECT coalesce(sum(p.amount),0) INTO paid FROM public.invoice_payments p
      WHERE p.invoice_id=inv.id AND p.tenant_id=inv.tenant_id AND p.reversed_at IS NULL;
  END IF;
  UPDATE public.sales_invoices SET paid_amount=coalesce(paid,0),status=CASE
    WHEN status::text='cancelled' THEN status
    WHEN paid>=total AND total>0 THEN 'paid'::public.sales_invoice_status
    WHEN paid>0 THEN 'partial'::public.sales_invoice_status
    WHEN due_date<(now() AT TIME ZONE 'Asia/Baku')::date THEN 'overdue'::public.sales_invoice_status
    WHEN status::text='draft' THEN status ELSE 'issued'::public.sales_invoice_status END,updated_at=now() WHERE id=inv.id;
  RETURN coalesce(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION private.sync_order_invoice_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.sales_invoices SET paid_amount=NEW.paid_amount,status=CASE
    WHEN status::text='cancelled' THEN status
    WHEN NEW.paid_amount>=total AND total>0 THEN 'paid'::public.sales_invoice_status
    WHEN NEW.paid_amount>0 THEN 'partial'::public.sales_invoice_status
    WHEN due_date<(now() AT TIME ZONE 'Asia/Baku')::date THEN 'overdue'::public.sales_invoice_status
    WHEN status::text='draft' THEN status ELSE 'issued'::public.sales_invoice_status END,updated_at=now()
    WHERE tenant_id=NEW.tenant_id AND order_id=NEW.id AND status::text<>'cancelled';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_order_invoice_balance ON public.orders;
CREATE TRIGGER sync_order_invoice_balance AFTER UPDATE OF paid_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.sync_order_invoice_balance();

CREATE OR REPLACE FUNCTION private.guard_invoice_cash_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; inv public.sales_invoices%rowtype;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF OLD.category='invoice_payment' OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE cash_transaction_id=OLD.reversal_of) THEN
      RAISE EXCEPTION 'invoice_cash_is_immutable';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;
  IF NEW.reversal_of IS NOT NULL THEN
    SELECT * INTO pay FROM public.invoice_payments WHERE cash_transaction_id=NEW.reversal_of;
    IF FOUND THEN
      IF auth.uid() IS NULL OR NOT private.has_module_access(pay.tenant_id,'finance','edit') THEN
        RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
      END IF;
      IF pay.tenant_id<>NEW.tenant_id OR pay.account_id<>NEW.account_id OR pay.currency<>NEW.currency
        OR pay.amount<>NEW.amount OR NEW.direction::text<>'out' OR NEW.category<>'transaction_reversal' THEN
        RAISE EXCEPTION 'invoice_cash_reversal_mismatch';
      END IF;
    END IF;
  ELSIF NEW.category='invoice_payment' THEN
    SELECT * INTO pay FROM public.invoice_payments WHERE id=NEW.reference_id;
    SELECT * INTO inv FROM public.sales_invoices WHERE id=pay.invoice_id;
    IF auth.uid() IS NULL OR NOT private.has_module_access(NEW.tenant_id,'finance','edit') THEN
      RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
    END IF;
    IF pay.id IS NULL OR pay.tenant_id<>NEW.tenant_id OR pay.account_id IS DISTINCT FROM NEW.account_id
      OR pay.currency<>NEW.currency OR pay.amount<>NEW.amount OR NEW.direction::text<>'in'
      OR NEW.reference_type IS DISTINCT FROM 'invoice_payment' OR inv.customer_id IS DISTINCT FROM NEW.customer_id
      OR pay.cash_transaction_id IS NOT NULL OR pay.reversed_at IS NOT NULL
      OR inv.status::text='cancelled' OR inv.order_id IS NOT NULL OR NOT inv.posted THEN
      RAISE EXCEPTION 'invoice_cash_source_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_cash_source_guard ON public.cash_transactions;
CREATE TRIGGER invoice_cash_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_cash_source();

-- A cashbook reversal must also reopen invoice debt and reverse its receipt journal.
CREATE OR REPLACE FUNCTION private.reverse_invoice_receipt_from_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; reversal_entry_id uuid;
BEGIN
  IF NEW.reversal_of IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO pay FROM public.invoice_payments WHERE tenant_id=NEW.tenant_id AND cash_transaction_id=NEW.reversal_of;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.sales_invoices WHERE id=pay.invoice_id FOR UPDATE;
  SELECT * INTO pay FROM public.invoice_payments WHERE id=pay.id FOR UPDATE;
  IF pay.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_already_reversed'; END IF;
  PERFORM private.assert_open_accounting_period(pay.tenant_id,(NEW.occurred_at AT TIME ZONE 'Asia/Baku')::date);
  IF pay.journal_entry_id IS NULL THEN RAISE EXCEPTION 'invoice_payment_requires_reconciliation'; END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(pay.tenant_id,(NEW.occurred_at AT TIME ZONE 'Asia/Baku')::date,pay.reference,'Invoice receipt reversal',
      'invoice_payment_reversal',pay.id,auth.uid()) RETURNING id INTO reversal_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    SELECT reversal_entry_id,l.account_id,l.credit,l.debit,'Invoice receipt reversal',l.line_no
    FROM public.journal_lines l WHERE l.entry_id=pay.journal_entry_id ORDER BY l.line_no;
  UPDATE public.journal_entries SET posted=true WHERE id=reversal_entry_id;
  UPDATE public.invoice_payments SET reversed_at=now(),reversal_journal_entry_id=reversal_entry_id WHERE id=pay.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reverse_invoice_receipt_from_cash ON public.cash_transactions;
CREATE TRIGGER reverse_invoice_receipt_from_cash AFTER INSERT ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION private.reverse_invoice_receipt_from_cash();

CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.sales_invoices%rowtype; line record; pay record; journal_id uuid; linked_status text;
BEGIN
  SELECT o.status::text INTO linked_status FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id
    WHERE i.id=_invoice_id FOR UPDATE OF o;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    private.has_module_access(inv.tenant_id,'invoices','edit') OR
    (linked_status IS NOT NULL AND private.has_module_access(inv.tenant_id,'sales','edit'))
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF inv.status::text='cancelled' THEN RETURN; END IF;
  PERFORM private.assert_open_accounting_period(inv.tenant_id,(now() AT TIME ZONE 'Asia/Baku')::date);
  FOR pay IN SELECT * FROM public.invoice_payments WHERE tenant_id=inv.tenant_id AND invoice_id=inv.id AND reversed_at IS NULL ORDER BY id LOOP
    IF pay.cash_transaction_id IS NULL OR pay.journal_entry_id IS NULL THEN
      RAISE EXCEPTION 'invoice_payment_requires_reconciliation';
    END IF;
    -- The reversal trigger closes the receipt's GL and paid_amount in this transaction.
    INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference,
      customer_id,description,occurred_at,created_by,reversal_of)
      VALUES(inv.tenant_id,pay.account_id,'out',pay.amount,pay.currency,'transaction_reversal',inv.invoice_no,
        inv.customer_id,'Invoice cancelled',now(),auth.uid(),pay.cash_transaction_id);
  END LOOP;
  IF inv.order_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_accounting_events
    WHERE tenant_id=inv.tenant_id AND order_id=inv.order_id AND event_type='delivery') THEN
    IF linked_status<>'cancelled' THEN RAISE EXCEPTION 'cancel_linked_order_first'; END IF;
  ELSIF inv.posted AND inv.journal_entry_id IS NOT NULL THEN
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
      VALUES(inv.tenant_id,(now() AT TIME ZONE 'Asia/Baku')::date,inv.invoice_no||'-L','Invoice reversal',
        'sales_invoice_cancellation',inv.id,auth.uid()) RETURNING id INTO journal_id;
    FOR line IN SELECT * FROM public.journal_lines WHERE entry_id=inv.journal_entry_id ORDER BY line_no LOOP
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,line.account_id,line.credit,line.debit,'Invoice reversal',line.line_no);
    END LOOP;
    UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
  END IF;
  UPDATE public.sales_invoices SET status='cancelled',updated_at=now() WHERE id=inv.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,inv.tenant_id,auth.uid(),'invoices','invoice_cancelled',inv.invoice_no,jsonb_build_object('invoice_id',inv.id));
END $$;

REVOKE ALL ON FUNCTION public.create_sales_invoice_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.post_invoice_to_gl(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.post_payment_to_gl(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sync_invoice_payment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_order_invoice_balance() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.reverse_invoice_receipt_from_cash() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.guard_invoice_cash_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_invoice_atomic(uuid,text,jsonb),public.record_invoice_payment_atomic(uuid,text,jsonb),
  public.post_invoice_to_gl(uuid),public.post_payment_to_gl(uuid),public.cancel_sales_invoice(uuid) TO authenticated;
-- Read-only tables for the browser. All writes above pass module/tenant guards.
REVOKE INSERT,UPDATE,DELETE ON public.sales_invoices,public.sales_invoice_lines,public.invoice_payments FROM authenticated;
