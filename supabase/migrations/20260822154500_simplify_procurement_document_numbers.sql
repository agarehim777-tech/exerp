BEGIN;

CREATE OR REPLACE FUNCTION public.assign_short_procurement_receipt_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  prefix text := 'GRN-' || to_char(COALESCE(NEW.receipt_date, CURRENT_DATE), 'YYMMDD') || '-';
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || prefix));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_no, '^' || prefix, ''), '')::integer), 0) + 1
    INTO next_sequence
    FROM public.procurement_receipts
   WHERE tenant_id = NEW.tenant_id
     AND receipt_no ~ ('^' || prefix || '[0-9]+$');
  NEW.receipt_no := prefix || lpad(next_sequence::text, 3, '0');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS assign_short_procurement_receipt_no_trg ON public.procurement_receipts;
CREATE TRIGGER assign_short_procurement_receipt_no_trg
BEFORE INSERT ON public.procurement_receipts
FOR EACH ROW EXECUTE FUNCTION public.assign_short_procurement_receipt_no();

COMMIT;
