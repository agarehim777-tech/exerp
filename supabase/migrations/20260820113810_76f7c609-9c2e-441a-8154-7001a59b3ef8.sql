CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _delta NUMERIC;
  _wh UUID;
  _prod UUID;
  _tenant UUID;
  _sku TEXT;
  _ref TEXT;
  _reftype TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _wh := OLD.warehouse_id; _prod := OLD.product_id; _tenant := OLD.tenant_id; _sku := OLD.sku;
    _ref := OLD.reference; _reftype := OLD.reference_type;
    _delta := CASE WHEN OLD.move_type = 'out' THEN COALESCE(OLD.qty,0) ELSE -COALESCE(OLD.qty,0) END;
  ELSE
    _wh := NEW.warehouse_id; _prod := NEW.product_id; _tenant := NEW.tenant_id; _sku := NEW.sku;
    _ref := NEW.reference; _reftype := NEW.reference_type;
    _delta := CASE WHEN NEW.move_type = 'out' THEN -COALESCE(NEW.qty,0) ELSE COALESCE(NEW.qty,0) END;
  END IF;

  -- Sistem funksiyaları (satış təhvili, ləğv, satınalma qəbulu, rezerv) qalığı
  -- özləri yeniləyir; ikiqat saymamaq üçün onları buraxırıq.
  IF _reftype IS NOT NULL
     OR _ref LIKE 'sales_order:%'
     OR _ref LIKE 'sales_return:%' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _wh IS NULL OR _prod IS NULL OR _delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, sku, on_hand, updated_at)
  VALUES (_tenant, _wh, _prod, _sku, _delta, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();