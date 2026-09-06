BEGIN;

CREATE TEMP TABLE procurement_shipment_number_map ON COMMIT DROP AS
SELECT
  id,
  tenant_id,
  shipment_no AS old_no,
  'SHP-' || lpad((1000 + row_number() OVER (
    PARTITION BY tenant_id
    ORDER BY created_at, id
  ))::text, 4, '0') AS new_no
FROM public.procurement_shipments;

CREATE TEMP TABLE procurement_receipt_number_map ON COMMIT DROP AS
SELECT
  id,
  tenant_id,
  receipt_no AS old_no,
  'GRN-' || lpad((1000 + row_number() OVER (
    PARTITION BY tenant_id
    ORDER BY created_at, id
  ))::text, 4, '0') AS new_no
FROM public.procurement_receipts;

-- Unikal məhdudiyyətlə toqquşmamaq üçün əvvəl müvəqqəti nömrələr yazılır.
UPDATE public.procurement_shipments
SET shipment_no = 'TMP-SHP-' || id::text;

UPDATE public.procurement_receipts
SET receipt_no = 'TMP-GRN-' || id::text;

UPDATE public.procurement_shipments AS shipment
SET shipment_no = number_map.new_no
FROM procurement_shipment_number_map AS number_map
WHERE shipment.id = number_map.id;

UPDATE public.procurement_receipts AS receipt
SET receipt_no = number_map.new_no
FROM procurement_receipt_number_map AS number_map
WHERE receipt.id = number_map.id;

-- Stok tarixçəsində mətn kimi saxlanmış köhnə göndəriş nömrələri də uyğunlaşdırılır.
UPDATE public.stock_movements AS movement
SET note = replace(movement.note, number_map.old_no, number_map.new_no)
FROM procurement_shipment_number_map AS number_map
WHERE movement.tenant_id = number_map.tenant_id
  AND movement.note LIKE '%' || number_map.old_no || '%';

CREATE OR REPLACE FUNCTION public.assign_short_procurement_receipt_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':procurement_receipts', 0));

  SELECT COALESCE(MAX(substring(receipt_no FROM '^GRN-([0-9]+)$')::integer), 1000) + 1
  INTO next_sequence
  FROM public.procurement_receipts
  WHERE tenant_id = NEW.tenant_id
    AND receipt_no ~ '^GRN-[0-9]+$';

  NEW.receipt_no := 'GRN-' || lpad(next_sequence::text, 4, '0');
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.assign_short_procurement_shipment_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  next_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':procurement_shipments', 0));

  SELECT COALESCE(MAX(substring(shipment_no FROM '^SHP-([0-9]+)$')::integer), 1000) + 1
  INTO next_sequence
  FROM public.procurement_shipments
  WHERE tenant_id = NEW.tenant_id
    AND shipment_no ~ '^SHP-[0-9]+$';

  NEW.shipment_no := 'SHP-' || lpad(next_sequence::text, 4, '0');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS assign_short_procurement_receipt_no_trg ON public.procurement_receipts;
CREATE TRIGGER assign_short_procurement_receipt_no_trg
BEFORE INSERT ON public.procurement_receipts
FOR EACH ROW EXECUTE FUNCTION public.assign_short_procurement_receipt_no();

DROP TRIGGER IF EXISTS assign_short_procurement_shipment_no_trg ON public.procurement_shipments;
CREATE TRIGGER assign_short_procurement_shipment_no_trg
BEFORE INSERT ON public.procurement_shipments
FOR EACH ROW EXECUTE FUNCTION public.assign_short_procurement_shipment_no();

COMMIT;
