ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN public.customers.birth_date IS
  'Optional customer birth date used for birthday reminders and congratulations.';
