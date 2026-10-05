CREATE TABLE public.vendor_invoice_tax_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.vendor_invoices(id) ON DELETE RESTRICT,
  tax_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  journal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  net_amount numeric(18,2) NOT NULL CHECK(net_amount > 0),
  tax_amount numeric(18,2) NOT NULL CHECK(tax_amount > 0),
  gross_amount numeric(18,2) NOT NULL CHECK(gross_amount = net_amount + tax_amount),
  currency text NOT NULL CHECK(currency = 'AZN'),
  tax_treatment text NOT NULL CHECK(tax_treatment = 'recoverable'),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.vendor_invoice_tax_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_invoice_tax_postings_read ON public.vendor_invoice_tax_postings FOR SELECT TO authenticated
  USING(public.is_tenant_member(tenant_id,auth.uid()) AND
    (coalesce(private.has_module_access(tenant_id,'finance','view'),false)
      OR coalesce(private.has_module_access(tenant_id,'procurement','view'),false)));
REVOKE ALL ON public.vendor_invoice_tax_postings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vendor_invoice_tax_postings TO authenticated;
GRANT ALL ON public.vendor_invoice_tax_postings TO service_role;
CREATE INDEX vendor_invoice_tax_postings_tenant_idx ON public.vendor_invoice_tax_postings(tenant_id,posted_at);
CREATE INDEX vendor_invoice_tax_postings_account_idx ON public.vendor_invoice_tax_postings(tax_account_id);

-- Reuse the payment request lock before the invoice lock, so direct and VAT
-- payment commands serialize in the same order and share replay semantics.
CREATE FUNCTION public.pay_vendor_invoice_with_tax_atomic(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; inv public.vendor_invoices%rowtype;
  posting public.vendor_invoice_tax_postings%rowtype;
  business_date date := (_payload->>'payment_date')::date;
  net_amount numeric; gross_amount numeric; tax_amount numeric;
  tax_gl uuid; payable_gl uuid; journal_id uuid; result_payload jsonb;
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
  IF inv.currency<>'AZN' THEN RAISE EXCEPTION 'invoice_fx_posting_required'; END IF;
  PERFORM 1 FROM public.purchase_orders WHERE id=inv.po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_purchase_scope'; END IF;
  PERFORM 1 FROM public.purchase_order_lines WHERE po_id=inv.po_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  SELECT round(sum(qty_invoiced*unit_price),2),round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2)
    INTO net_amount,gross_amount FROM public.vendor_invoice_lines WHERE invoice_id=inv.id;
  tax_amount:=gross_amount-net_amount;
  IF net_amount IS NULL OR net_amount<=0 OR net_amount::text IN ('NaN','Infinity','-Infinity')
    OR gross_amount IS NULL OR gross_amount<=0 OR gross_amount::text IN ('NaN','Infinity','-Infinity')
    OR tax_amount<0 THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  IF tax_amount>0 THEN
    IF _payload->>'tax_treatment' IS DISTINCT FROM 'recoverable' THEN RAISE EXCEPTION 'invoice_tax_policy_required'; END IF;
    tax_gl:=(_payload->>'tax_account_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts a WHERE a.id=tax_gl AND a.tenant_id=_tenant_id
      AND a.is_active AND a.type::text='asset' AND a.currency=inv.currency
      AND a.code NOT IN ('1000','1010','1200','2050')
      AND NOT EXISTS(SELECT 1 FROM public.cash_accounts c WHERE c.tenant_id=_tenant_id AND c.gl_account_id=a.id)) THEN
      RAISE EXCEPTION 'invalid_invoice_tax_account';
    END IF;
    PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
    PERFORM public.ensure_inventory_accounts(_tenant_id);
    payable_gl:=public.gl_account_by_code(_tenant_id,'2200');
    SELECT * INTO posting FROM public.vendor_invoice_tax_postings WHERE tenant_id=_tenant_id AND invoice_id=inv.id;
    IF FOUND THEN
      IF posting.net_amount<>net_amount OR posting.tax_amount<>tax_amount OR posting.gross_amount<>gross_amount
        OR posting.tax_account_id<>tax_gl THEN RAISE EXCEPTION 'invoice_tax_posting_mismatch'; END IF;
    ELSE
      INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
        VALUES(_tenant_id,business_date,inv.invoice_number,'Recoverable vendor invoice tax','vendor_invoice_tax',inv.id,auth.uid()) RETURNING id INTO journal_id;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,tax_gl,tax_amount,0,'Recoverable input tax',1),(journal_id,payable_gl,0,tax_amount,'Vendor tax payable',2);
      UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
      INSERT INTO public.vendor_invoice_tax_postings(tenant_id,invoice_id,tax_account_id,journal_entry_id,net_amount,tax_amount,gross_amount,currency,tax_treatment,created_by)
        VALUES(_tenant_id,inv.id,tax_gl,journal_id,net_amount,tax_amount,gross_amount,inv.currency,'recoverable',auth.uid());
    END IF;
  END IF;
  -- Any receipt, match, cash or period failure also rolls back the tax posting.
  result_payload:=public.pay_vendor_invoice_atomic(_tenant_id,_request_key,_payload);
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.pay_vendor_invoice_with_tax_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_vendor_invoice_with_tax_atomic(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_vendor_invoice_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expected_net numeric; expected_gross numeric; expected_tax numeric;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  IF NEW.status='paid' THEN
    IF NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments WHERE invoice_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
      RAISE EXCEPTION 'invoice_payment_requires_server_command';
    END IF;
    SELECT round(sum(qty_invoiced*unit_price),2),round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2)
      INTO expected_net,expected_gross FROM public.vendor_invoice_lines WHERE invoice_id=NEW.id;
    expected_tax:=expected_gross-expected_net;
    IF EXISTS(SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id=NEW.id AND tax_rate<>0)
      AND expected_tax>0 AND NOT EXISTS(SELECT 1 FROM public.vendor_invoice_tax_postings p
        JOIN public.journal_entries j ON j.id=p.journal_entry_id AND j.tenant_id=NEW.tenant_id AND j.posted
        WHERE p.tenant_id=NEW.tenant_id AND p.invoice_id=NEW.id AND p.net_amount=expected_net
          AND p.tax_amount=expected_tax AND p.gross_amount=expected_gross AND p.currency=NEW.currency) THEN
      RAISE EXCEPTION 'invoice_vat_posting_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_vendor_invoice_payment() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.guard_vendor_tax_posting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'posted_invoice_tax_is_immutable'; END $$;
REVOKE ALL ON FUNCTION private.guard_vendor_tax_posting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vendor_tax_posting_immutable BEFORE UPDATE OR DELETE ON public.vendor_invoice_tax_postings
  FOR EACH ROW EXECUTE FUNCTION private.guard_vendor_tax_posting();
