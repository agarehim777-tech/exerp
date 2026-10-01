-- Canonical commands own balance updates; the legacy trigger only owns legacy rows.
DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('public.apply_stock_movement()'::regprocedure)
    INTO definition;
  IF position('canonical_balance_owner' IN definition) = 0 THEN
    definition := regexp_replace(definition, E'BEGIN', $guard$BEGIN
  -- canonical_balance_owner: do not double-post command-managed balances.
  IF (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)
       ? 'movement_type' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
$guard$);
    EXECUTE definition;
  END IF;
END;
$migration$;
