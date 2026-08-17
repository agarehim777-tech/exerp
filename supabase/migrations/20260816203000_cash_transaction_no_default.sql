-- Compatibility guard: every cash insertion receives a transaction number,
-- including older clients that do not yet send the new required field.
ALTER TABLE public.cash_transactions
  ALTER COLUMN transaction_no SET DEFAULT (
    'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );

