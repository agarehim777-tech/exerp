BEGIN;

-- Müvəqqəti unikal dəyərlər köhnə və yeni nömrələr arasında konfliktin qarşısını alır.
UPDATE public.procurement_receipts
   SET receipt_no = 'TMP-GRN-' || id::text;

WITH numbered AS (
  SELECT id,
         'GRN-' || to_char(COALESCE(receipt_date, created_at::date, CURRENT_DATE), 'YYMMDD') || '-' ||
         lpad(row_number() OVER (
           PARTITION BY tenant_id, COALESCE(receipt_date, created_at::date, CURRENT_DATE)
           ORDER BY created_at, id
         )::text, 3, '0') AS document_no
    FROM public.procurement_receipts
)
UPDATE public.procurement_receipts AS receipt
   SET receipt_no = numbered.document_no
  FROM numbered
 WHERE receipt.id = numbered.id;

UPDATE public.procurement_shipments
   SET shipment_no = 'TMP-SHP-' || id::text;

WITH numbered AS (
  SELECT id,
         'SHP-' || to_char(COALESCE(shipment_date, created_at::date, CURRENT_DATE), 'YYMMDD') || '-' ||
         lpad(row_number() OVER (
           PARTITION BY tenant_id, COALESCE(shipment_date, created_at::date, CURRENT_DATE)
           ORDER BY created_at, id
         )::text, 3, '0') AS document_no
    FROM public.procurement_shipments
)
UPDATE public.procurement_shipments AS shipment
   SET shipment_no = numbered.document_no
  FROM numbered
 WHERE shipment.id = numbered.id;

CREATE OR REPLACE FUNCTION public.assign_short_procurement_shipment_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  prefix text := 'SHP-' || to_char(COALESCE(NEW.shipment_date, CURRENT_DATE), 'YYMMDD') || '-';
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || prefix));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(shipment_no, '^' || prefix, ''), '')::integer), 0) + 1
    INTO next_sequence
    FROM public.procurement_shipments
   WHERE tenant_id = NEW.tenant_id
     AND shipment_no ~ ('^' || prefix || '[0-9]+$');
  NEW.shipment_no := prefix || lpad(next_sequence::text, 3, '0');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS assign_short_procurement_shipment_no_trg ON public.procurement_shipments;
CREATE TRIGGER assign_short_procurement_shipment_no_trg
BEFORE INSERT ON public.procurement_shipments
FOR EACH ROW EXECUTE FUNCTION public.assign_short_procurement_shipment_no();

COMMIT;
