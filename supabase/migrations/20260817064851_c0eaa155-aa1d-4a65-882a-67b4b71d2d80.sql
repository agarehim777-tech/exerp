-- 20260816208000_optional_customer_email.sql
UPDATE public.customers
   SET email = NULL
 WHERE email IS NOT NULL
   AND btrim(email) = '';

-- 20260816210000_stock_balance_average_cost.sql
ALTER TABLE public.stock_balances
  ADD COLUMN IF NOT EXISTS avg_cost numeric(18,6) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.stock_balances
    ADD CONSTRAINT stock_balances_avg_cost_check CHECK (avg_cost >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.stock_balances balance
   SET avg_cost = source.avg_cost,
       updated_at = now()
  FROM (
    SELECT tenant_id, warehouse_id, product_id,
           round(
             sum(abs(quantity) * unit_cost) / NULLIF(sum(abs(quantity)), 0),
             6
           ) AS avg_cost
      FROM public.stock_movements
     WHERE movement_type IN ('receipt', 'transfer_in')
       AND quantity > 0
       AND unit_cost >= 0
     GROUP BY tenant_id, warehouse_id, product_id
  ) source
 WHERE balance.tenant_id = source.tenant_id
   AND balance.warehouse_id = source.warehouse_id
   AND balance.product_id = source.product_id;

CREATE OR REPLACE FUNCTION public.update_stock_balance_average_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type IN ('receipt', 'transfer_in')
     AND NEW.quantity > 0
     AND NEW.unit_cost >= 0 THEN
    UPDATE public.stock_balances
       SET avg_cost = CASE
             WHEN on_hand > 0 THEN round(
               (
                 GREATEST(0, on_hand - NEW.quantity) * avg_cost
                 + NEW.quantity * NEW.unit_cost
               ) / on_hand,
               6
             )
             ELSE NEW.unit_cost
           END,
           updated_at = now()
     WHERE tenant_id = NEW.tenant_id
       AND warehouse_id = NEW.warehouse_id
       AND product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_balance_average_cost ON public.stock_movements;
CREATE TRIGGER trg_stock_balance_average_cost
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.update_stock_balance_average_cost();

-- 20260816211000_product_minimum_stock.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(14,3) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_minimum_stock_check CHECK (minimum_stock >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- 20260816212000_product_recommended_order_qty.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recommended_order_qty numeric(14,3) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_recommended_order_qty_check CHECK (recommended_order_qty >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.products.recommended_order_qty IS
  'Minimum stok həddinə çatdıqda alınması planlaşdırılan baza məhsul miqdarı';