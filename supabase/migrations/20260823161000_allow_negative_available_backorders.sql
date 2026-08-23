-- Backorder policy:
-- physical stock (on_hand) never becomes negative, while reservations may be
-- greater than physical stock. The difference is the negative saleable stock
-- used by procurement demand planning.
DO $$
DECLARE
  constraint_row record;
BEGIN
  IF to_regclass('public.stock_balances') IS NULL THEN
    RETURN;
  END IF;

  FOR constraint_row IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.stock_balances'::regclass
      AND c.contype = 'c'
      AND lower(pg_get_constraintdef(c.oid)) LIKE '%reserved%'
      AND lower(pg_get_constraintdef(c.oid)) LIKE '%on_hand%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.stock_balances.reserved IS
  'Active sales demand. May exceed on_hand; on_hand - reserved is saleable stock and may be negative.';
