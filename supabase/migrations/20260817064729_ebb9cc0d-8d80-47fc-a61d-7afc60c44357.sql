BEGIN;

-- stock_movements: new columns for the new branch code (keep old move_type/qty for safety)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS movement_type text,
  ADD COLUMN IF NOT EXISTS quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid;

-- Sync existing rows into the new columns
UPDATE public.stock_movements
   SET movement_type = COALESCE(movement_type, move_type::text),
       quantity = COALESCE(quantity, qty),
       reference_type = COALESCE(reference_type, doc_no),
       reference_id = CASE
         WHEN reference IS NOT NULL AND reference ~ '^[0-9a-fA-F-]{36}$'
         THEN reference::uuid
         ELSE reference_id
       END
 WHERE movement_type IS NULL
    OR quantity IS NULL
    OR reference_type IS NULL
    OR reference_id IS NULL;

-- stock_balances: rename to the new branch naming
ALTER TABLE public.stock_balances
  RENAME COLUMN qty TO on_hand;

ALTER TABLE public.stock_balances
  RENAME COLUMN reorder_point TO minimum_level;

ALTER TABLE public.stock_balances
  ADD COLUMN IF NOT EXISTS reserved numeric(14,3) NOT NULL DEFAULT 0;

-- products: new catalog columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_order_qty numeric(14,3) NOT NULL DEFAULT 0;

COMMIT;