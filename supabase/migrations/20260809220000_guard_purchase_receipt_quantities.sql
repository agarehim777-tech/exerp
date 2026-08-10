CREATE OR REPLACE FUNCTION public.guard_purchase_receipt_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ordered numeric;
  v_other_accepted numeric;
BEGIN
  IF NEW.qty_received < 0 OR NEW.qty_rejected < 0 OR NEW.qty_rejected > NEW.qty_received THEN
    RAISE EXCEPTION 'Rədd miqdarı qəbul miqdarından çox ola bilməz';
  END IF;

  SELECT qty_ordered INTO v_ordered
  FROM public.purchase_order_lines
  WHERE id = NEW.po_line_id;

  SELECT COALESCE(sum(qty_received - qty_rejected), 0) INTO v_other_accepted
  FROM public.goods_receipt_lines
  WHERE po_line_id = NEW.po_line_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_other_accepted + (NEW.qty_received - NEW.qty_rejected) > v_ordered + 0.000001 THEN
    RAISE EXCEPTION 'Qəbul miqdarı sifariş qalığından artıq ola bilməz';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_receipt_quantity_trg ON public.goods_receipt_lines;
CREATE TRIGGER guard_purchase_receipt_quantity_trg
BEFORE INSERT OR UPDATE OF po_line_id, qty_received, qty_rejected
ON public.goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_receipt_quantity();
