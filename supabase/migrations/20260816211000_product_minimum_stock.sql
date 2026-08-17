-- Minimum stock is a product policy. Persist it in the catalog and mirror it
-- to every warehouse balance so low-stock checks use one consistent value.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(14,3) NOT NULL DEFAULT 0
  CHECK (minimum_stock >= 0);

UPDATE public.products product
   SET minimum_stock = source.minimum_stock
  FROM (
    SELECT product_id, max(minimum_level) AS minimum_stock
      FROM public.stock_balances
     GROUP BY product_id
  ) source
 WHERE product.id = source.product_id
   AND product.minimum_stock = 0
   AND source.minimum_stock > 0;

UPDATE public.stock_balances balance
   SET minimum_level = product.minimum_stock,
       updated_at = now()
  FROM public.products product
 WHERE product.id = balance.product_id
   AND balance.minimum_level IS DISTINCT FROM product.minimum_stock;

CREATE OR REPLACE FUNCTION public.sync_product_minimum_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    UPDATE public.stock_balances
       SET minimum_level = NEW.minimum_stock, updated_at = now()
     WHERE tenant_id = NEW.tenant_id AND product_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.minimum_level = 0 THEN
    SELECT minimum_stock INTO NEW.minimum_level
      FROM public.products
     WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;
    NEW.minimum_level := COALESCE(NEW.minimum_level, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_minimum_stock ON public.products;
CREATE TRIGGER trg_product_minimum_stock
AFTER UPDATE OF minimum_stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_minimum_stock();

DROP TRIGGER IF EXISTS trg_balance_minimum_stock ON public.stock_balances;
CREATE TRIGGER trg_balance_minimum_stock
BEFORE INSERT ON public.stock_balances
FOR EACH ROW EXECUTE FUNCTION public.sync_product_minimum_stock();

