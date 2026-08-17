-- Keep the current weighted-average cost next to each warehouse balance so
-- stock valuation screens do not have to reconstruct cost from the catalog.
ALTER TABLE public.stock_balances
  ADD COLUMN IF NOT EXISTS avg_cost numeric(18,6) NOT NULL DEFAULT 0
  CHECK (avg_cost >= 0);

-- Existing receipt movements already contain the landed unit cost. Use them
-- to initialise balances that predate the avg_cost column.
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
    -- Receipt workflows increase on_hand before writing the movement. The
    -- quantity before this receipt is therefore (on_hand - NEW.quantity).
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

