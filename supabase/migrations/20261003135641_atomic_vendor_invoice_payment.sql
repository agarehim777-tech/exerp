CREATE TABLE public.vendor_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.vendor_invoices(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.cash_accounts(id),
  cash_transaction_id uuid NOT NULL UNIQUE REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  journal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK(amount>0), currency text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.vendor_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_invoice_payments_read ON public.vendor_invoice_payments FOR SELECT TO authenticated
  USING(public.is_tenant_member(tenant_id,auth.uid()) AND coalesce(private.has_module_access(tenant_id,'finance','view'),false));
GRANT SELECT ON public.vendor_invoice_payments TO authenticated;
GRANT ALL ON public.vendor_invoice_payments TO service_role;
REVOKE ALL ON public.vendor_invoice_payments FROM anon;
CREATE INDEX vendor_invoice_payments_tenant_idx ON public.vendor_invoice_payments(tenant_id,paid_at);

CREATE FUNCTION public.pay_vendor_invoice_atomic(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; inv public.vendor_invoices%rowtype;
  account public.cash_accounts%rowtype; po public.purchase_orders%rowtype;
  total_amount numeric; available numeric; cash_id uuid; journal_id uuid; payment_id uuid;
  business_date date := (_payload->>'payment_date')::date; cash_gl uuid; payable_gl uuid; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'procurement','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR business_date IS NULL THEN RAISE EXCEPTION 'invalid_payment_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'pay_vendor_invoice_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'pay_vendor_invoice_atomic' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  SELECT * INTO inv FROM public.vendor_invoices WHERE id=(_payload->>'invoice_id')::uuid AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF inv.status NOT IN ('matched','approved') THEN RAISE EXCEPTION 'invoice_not_payable'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id=inv.po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND OR po.vendor_id<>inv.vendor_id OR po.status::text IN ('draft','cancelled') THEN RAISE EXCEPTION 'invalid_purchase_scope'; END IF;
  IF inv.currency<>'AZN' OR po.currency<>inv.currency THEN RAISE EXCEPTION 'invoice_fx_posting_required'; END IF;
  PERFORM 1 FROM public.purchase_order_lines WHERE po_id=po.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id)
    OR EXISTS(SELECT 1 FROM public.vendor_invoice_lines l LEFT JOIN public.purchase_order_lines p ON p.id=l.po_line_id
      WHERE l.invoice_id=inv.id AND (p.id IS NULL OR p.po_id<>po.id OR l.tax_rate<0 OR l.tax_rate>100))
    OR EXISTS(SELECT 1 FROM public.evaluate_invoice_match(inv.id,0,0.02) WHERE status<>'matched') THEN RAISE EXCEPTION 'invoice_match_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_order_lines p WHERE p.po_id=po.id AND
    (SELECT coalesce(sum(l.qty_invoiced),0) FROM public.vendor_invoice_lines l JOIN public.vendor_invoices v ON v.id=l.invoice_id
      WHERE l.po_line_id=p.id AND v.tenant_id=_tenant_id AND v.status<>'cancelled')>
    (SELECT coalesce(sum(l.qty_received-l.qty_rejected),0) FROM public.goods_receipt_lines l WHERE l.po_line_id=p.id)) THEN
    RAISE EXCEPTION 'invoice_quantity_exceeds_receipts';
  END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_order_lines p WHERE p.po_id=po.id AND
    (SELECT coalesce(sum(l.qty_invoiced),0) FROM public.vendor_invoice_lines l JOIN public.vendor_invoices v ON v.id=l.invoice_id
      WHERE l.po_line_id=p.id AND v.tenant_id=_tenant_id AND v.status<>'cancelled')>
    (SELECT coalesce(sum(l.received_qty),0) FROM public.procurement_receipt_lines l
      JOIN public.procurement_receipts r ON r.id=l.receipt_id AND r.tenant_id=_tenant_id
      WHERE l.po_line_id=p.id AND EXISTS(SELECT 1 FROM public.journal_entries j
        WHERE j.tenant_id=_tenant_id AND j.source_type='procurement_receipt' AND j.source_id=r.id AND j.posted))) THEN
    RAISE EXCEPTION 'posted_inventory_receipt_required';
  END IF;
  SELECT round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2) INTO total_amount FROM public.vendor_invoice_lines WHERE invoice_id=inv.id;
  IF total_amount IS NULL OR total_amount<=0 OR total_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  SELECT * INTO account FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF account.currency<>inv.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  SELECT account.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
    INTO available FROM public.cash_transactions WHERE tenant_id=_tenant_id AND account_id=account.id;
  IF total_amount>available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  PERFORM public.ensure_inventory_accounts(_tenant_id);
  cash_gl:=coalesce(account.gl_account_id,public.gl_account_by_code(_tenant_id,CASE WHEN account.type::text='cash' THEN '1000' ELSE '1010' END));
  payable_gl:=public.gl_account_by_code(_tenant_id,'2200');
  IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=cash_gl AND tenant_id=_tenant_id) THEN RAISE EXCEPTION 'invalid_cash_gl_scope'; END IF;
  INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference_type,reference_id,reference,vendor_id,description,occurred_at,created_by)
    VALUES(_tenant_id,account.id,'out',total_amount,inv.currency,'vendor_invoice_payment','vendor_invoice',inv.id,inv.invoice_number,inv.vendor_id,
      'Vendor invoice payment',business_date::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()) RETURNING id INTO cash_id;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,business_date,inv.invoice_number,'Vendor payable settlement','vendor_invoice_payment',cash_id,auth.uid()) RETURNING id INTO journal_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    VALUES(journal_id,payable_gl,total_amount,0,'Vendor payable',1),(journal_id,cash_gl,0,total_amount,'Cash payment',2);
  UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
  INSERT INTO public.vendor_invoice_payments(tenant_id,invoice_id,account_id,cash_transaction_id,journal_entry_id,amount,currency,created_by)
    VALUES(_tenant_id,inv.id,account.id,cash_id,journal_id,total_amount,inv.currency,auth.uid()) RETURNING id INTO payment_id;
  UPDATE public.vendor_invoices SET status='paid',updated_at=now() WHERE id=inv.id;
  result_payload:=jsonb_build_object('payment_id',payment_id,'invoice_id',inv.id,'cash_transaction_id',cash_id,'journal_entry_id',journal_id,'amount',total_amount);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'procurement','invoice_paid',inv.invoice_number,result_payload);
  UPDATE public.operation_requests SET status='completed',completed_at=now(),result=result_payload WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.pay_vendor_invoice_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_vendor_invoice_atomic(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.guard_vendor_invoice_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  IF NEW.status='paid' AND NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments WHERE invoice_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RAISE EXCEPTION 'invoice_payment_requires_server_command';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_vendor_invoice_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vendor_invoice_payment_guard BEFORE INSERT OR UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_vendor_invoice_payment();

CREATE FUNCTION private.guard_paid_invoice_lines() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM 1 FROM public.vendor_invoices WHERE id=OLD.invoice_id AND status='paid' FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
    PERFORM 1 FROM public.vendor_invoices WHERE id=NEW.invoice_id AND status='paid' FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.guard_paid_invoice_lines() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER paid_invoice_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_invoice_lines();
