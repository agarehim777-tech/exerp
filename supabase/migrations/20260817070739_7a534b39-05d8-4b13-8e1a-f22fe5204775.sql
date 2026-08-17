ALTER TABLE public.stock_movements
  ALTER COLUMN move_type SET DEFAULT 'adjust',
  ALTER COLUMN qty SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_stock_movement_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.move_type IS NULL THEN
    NEW.move_type := CASE
      WHEN NEW.movement_type IN ('in','receipt','transfer_in') THEN 'in'
      WHEN NEW.movement_type IN ('out','delivery','transfer_out','write_off') THEN 'out'
      ELSE 'adjust'
    END;
  END IF;
  IF NEW.qty IS NULL THEN
    NEW.qty := COALESCE(ABS(NEW.quantity), 0);
  END IF;
  IF NEW.movement_type IS NULL THEN
    NEW.movement_type := NEW.move_type;
  END IF;
  IF NEW.quantity IS NULL THEN
    NEW.quantity := COALESCE(NEW.qty, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_stock_movement_legacy_columns ON public.stock_movements;
CREATE TRIGGER sync_stock_movement_legacy_columns
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_movement_legacy_columns();