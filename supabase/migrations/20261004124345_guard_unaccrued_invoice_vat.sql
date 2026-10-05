CREATE OR REPLACE FUNCTION private.guard_vendor_invoice_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  IF NEW.status='paid' THEN
    IF NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments WHERE invoice_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
      RAISE EXCEPTION 'invoice_payment_requires_server_command';
    END IF;
    -- Receipt posting accrues net landed cost only; VAT needs its own approved accrual policy.
    IF EXISTS(SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id=NEW.id AND tax_rate<>0) THEN
      RAISE EXCEPTION 'invoice_vat_posting_required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_vendor_invoice_payment() FROM PUBLIC,anon,authenticated;
