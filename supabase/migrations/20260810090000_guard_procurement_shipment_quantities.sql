CREATE OR REPLACE FUNCTION public.guard_procurement_shipment_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_ordered numeric; v_other numeric;
BEGIN
  SELECT qty_ordered INTO v_ordered FROM public.purchase_order_lines WHERE id=NEW.po_line_id;
  SELECT COALESCE(sum(shipped_qty),0) INTO v_other FROM public.procurement_shipment_lines
   WHERE po_line_id=NEW.po_line_id AND id IS DISTINCT FROM NEW.id;
  IF NEW.shipped_qty<=0 OR v_other+NEW.shipped_qty>v_ordered+0.000001 THEN
    RAISE EXCEPTION 'Göndərilən miqdar sifariş qalığından artıq ola bilməz';
  END IF;
  IF NEW.received_qty<0 OR NEW.received_qty>NEW.shipped_qty THEN
    RAISE EXCEPTION 'Qəbul miqdarı göndərilən miqdardan artıq ola bilməz';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_procurement_shipment_quantity_trg ON public.procurement_shipment_lines;
CREATE TRIGGER guard_procurement_shipment_quantity_trg BEFORE INSERT OR UPDATE OF po_line_id,shipped_qty,received_qty
ON public.procurement_shipment_lines FOR EACH ROW EXECUTE FUNCTION public.guard_procurement_shipment_quantity();
