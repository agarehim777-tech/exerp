ALTER TABLE public.stock_reservations
  ADD COLUMN IF NOT EXISTS created_by uuid;

GRANT SELECT, INSERT, UPDATE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;