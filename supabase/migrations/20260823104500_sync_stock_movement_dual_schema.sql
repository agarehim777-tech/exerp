BEGIN;

CREATE OR REPLACE FUNCTION public.sync_stock_movement_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Yeni sxemlə yazılan sətrlərdə legacy default adjust/0 real məlumatı
  -- kölgələməməlidir.
  IF NEW.movement_type IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    NEW.move_type := CASE
      WHEN NEW.movement_type IN ('in', 'receipt', 'transfer_in') THEN 'in'::public.stock_move_type
      WHEN NEW.movement_type IN ('out', 'delivery', 'transfer_out', 'write_off') THEN 'out'::public.stock_move_type
      ELSE 'adjust'::public.stock_move_type
    END;
    NEW.qty := CASE
      WHEN NEW.movement_type IN ('reservation', 'release') THEN 0
      ELSE abs(NEW.quantity)
    END;
  ELSE
    NEW.movement_type := COALESCE(NEW.movement_type, NEW.move_type::text);
    NEW.quantity := COALESCE(
      NEW.quantity,
      CASE WHEN NEW.move_type = 'out' THEN -abs(NEW.qty) ELSE NEW.qty END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_stock_movement_legacy_columns ON public.stock_movements;
CREATE TRIGGER sync_stock_movement_legacy_columns
BEFORE INSERT OR UPDATE OF movement_type, quantity, move_type, qty ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_movement_legacy_columns();

-- Əvvəl yeni sütunlarla yaradılıb legacy sahələri adjust/0 qalan sətrləri bərpa et.
UPDATE public.stock_movements
SET move_type = CASE
      WHEN movement_type IN ('in', 'receipt', 'transfer_in') THEN 'in'::public.stock_move_type
      WHEN movement_type IN ('out', 'delivery', 'transfer_out', 'write_off') THEN 'out'::public.stock_move_type
      ELSE 'adjust'::public.stock_move_type
    END,
    qty = CASE
      WHEN movement_type IN ('reservation', 'release') THEN 0
      ELSE abs(quantity)
    END
WHERE movement_type IS NOT NULL
  AND quantity IS NOT NULL
  AND (
    qty IS DISTINCT FROM CASE WHEN movement_type IN ('reservation', 'release') THEN 0 ELSE abs(quantity) END
    OR move_type IS DISTINCT FROM CASE
      WHEN movement_type IN ('in', 'receipt', 'transfer_in') THEN 'in'::public.stock_move_type
      WHEN movement_type IN ('out', 'delivery', 'transfer_out', 'write_off') THEN 'out'::public.stock_move_type
      ELSE 'adjust'::public.stock_move_type
    END
  );

COMMIT;
