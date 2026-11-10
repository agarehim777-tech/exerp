CREATE OR REPLACE FUNCTION private.guard_vendor_invoice_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE expected_net numeric; expected_gross numeric; expected_tax numeric;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN
    -- A paid invoice may only leave the paid state once its payment record has been
    -- removed by the server-side reversal command, which also writes the reversing
    -- cash and journal entries. Clients cannot delete payment rows (read-only RLS).
    IF NEW.status <> 'paid'
       AND NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments
                       WHERE invoice_id = NEW.id AND tenant_id = NEW.tenant_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'paid_invoice_is_immutable';
  END IF;
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
END $function$;